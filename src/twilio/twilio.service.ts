import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as twilio from "twilio";

/**
 * Service responsible for interacting with Twilio Voice APIs and generating TwiML.
 * Configured with:
 * - Amazon Polly Neural voices for natural human inflection.
 * - Instant barge-in (caller speaks -> agent stops speaking immediately).
 * - Fast silence cut-off (speechTimeout=1s) to eliminate dead air.
 * - Dual-input mode (speech + DTMF keypad press) for high accuracy.
 * - Bilingual support for English and French.
 */
@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly client: twilio.Twilio;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>("TWILIO_ACCOUNT_SID");
    const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN");
    this.client = twilio.default(accountSid, authToken);
  }

  /**
   * Initiates an outbound telephone call to the target phone number.
   *
   * @param to Destination phone number in E.164 format.
   * @param webhookBaseUrl Publicly accessible base URL (e.g. ngrok or cloudflared).
   * @param aiCallId Unique database identifier for this call.
   */
  public async createOutboundCall(
    to: string,
    webhookBaseUrl: string,
    aiCallId: string,
  ): Promise<{ callSid: string }> {
    try {
      this.logger.log(
        `Creating outbound call to [REDACTED] for callId=${aiCallId}`,
      );
      const call = await this.client.calls.create({
        to,
        from: this.configService.get<string>("TWILIO_PHONE_NUMBER"),
        url: `${webhookBaseUrl}/ai-call/twilio/voice?callId=${aiCallId}`,
        statusCallback: `${webhookBaseUrl}/ai-call/twilio/status`,
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      });
      this.logger.log(`Outbound call created: SID=${call.sid}`);
      return { callSid: call.sid };
    } catch (error) {
      this.logger.error(
        "Failed to create outbound Twilio call",
        error?.message,
      );
      throw error;
    }
  }

  /**
   * Validates the cryptographic signature of incoming Twilio webhooks.
   */
  public validateWebhookSignature(
    authToken: string,
    signature: string,
    url: string,
    params: Record<string, string>,
  ): boolean {
    try {
      return twilio.validateRequest(authToken, signature, url, params);
    } catch (error) {
      this.logger.error("Error validating Twilio webhook signature", error);
      return false;
    }
  }

  /**
   * Turn 1 Language Selection TwiML:
   * Greets the caller upon answering and prompts for language preference:
   * - English: Say "English" or press 1 (Spoken by Polly.Danielle-Neural)
   * - French: Say "Français" or press 2 (Spoken by Polly.Lea-Neural)
   *
   * Features:
   * - bargeIn="true": Prompt cuts off instantly when caller speaks or presses a key.
   * - speechTimeout="1": Responds promptly after user finishes speaking.
   * - Fallback: Gracefully defaults to English if no response after 6 seconds.
   */
  public generateLanguageSelectionTwiML(actionUrl: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" action="${actionUrl}" method="POST" language="en-US" bargeIn="true" speechTimeout="1" timeout="6" hints="English, French, Français, one, two, un, deux">
    <Say voice="Polly.Danielle-Neural" language="en-US">For English, say English or press 1.</Say>
    <Say voice="Polly.Lea-Neural" language="fr-FR">Pour le français, dites Français ou appuyez sur 2.</Say>
  </Gather>
  <Say voice="Polly.Danielle-Neural" language="en-US">I didn't hear a response. Continuing in English.</Say>
  <Redirect method="POST">${actionUrl}?defaultLang=en</Redirect>
</Response>`;
  }

  /**
   * Generates multi-turn Gather TwiML with neural voice, instant barge-in,
   * vocabulary hints, and dual speech + DTMF input.
   *
   * @param text The conversational response text from the AI assistant.
   * @param actionUrl The webhook URL Twilio should POST to with the user's reply.
   * @param language The language code ('en' or 'fr').
   */
  public generateGatherTwiML(
    text: string,
    actionUrl: string,
    language?: string,
  ): string {
    const isFrench = language === "fr";
    const lang = isFrench ? "fr-FR" : "en-US";
    const voice = isFrench ? "Polly.Lea-Neural" : "Polly.Danielle-Neural";
    const speechModel = isFrench ? "phone_call" : "experimental_conversations";

    // Vocabulary hints to boost speech recognition accuracy
    const hints = isFrench
      ? "confirmer, annuler, reporter, oui, non, français, Docteur, rendez-vous, matin, après-midi, lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche, satisfait, merci, au revoir"
      : "confirm, cancel, reschedule, yes, no, English, Doctor, appointment, morning, afternoon, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, satisfied, thank you, goodbye";

    const fallbackNoInput = isFrench
      ? "Je n'ai pas entendu de réponse. Au revoir."
      : "I didn't hear a response. Goodbye.";

    const normalized = this.normalizeForTTS(text, language);
    const escaped = this.escapeXml(normalized);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" action="${actionUrl}" method="POST" language="${lang}" speechModel="${speechModel}" speechTimeout="1" timeout="5" bargeIn="true" hints="${hints}">
    <Say voice="${voice}" language="${lang}">${escaped}</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">${fallbackNoInput}</Say>
  <Hangup/>
</Response>`;
  }

  /**
   * Generates a final statement and hangs up the call.
   * Used when an appointment action is complete and the patient is satisfied.
   */
  public generateTwiML(text: string, language?: string): string {
    const isFrench = language === "fr";
    const lang = isFrench ? "fr-FR" : "en-US";
    const voice = isFrench ? "Polly.Lea-Neural" : "Polly.Danielle-Neural";

    const normalized = this.normalizeForTTS(text, language);
    const escaped = this.escapeXml(normalized);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${escaped}</Say>
  <Hangup/>
</Response>`;
  }

  public generateHangupTwiML(text: string, language?: string): string {
    return this.generateTwiML(text, language);
  }

  /**
   * Pre-formats raw text into speakable phonetics for Text-to-Speech:
   * - Strips markdown formatting (*, #, _) and internal [CALL_COMPLETE] tokens.
   * - Expands medical abbreviations (Dr. -> Doctor / Docteur).
   * - Normalizes patient/appointment IDs for clear letter-by-letter pronunciation.
   */
  public normalizeForTTS(text: string, language?: string): string {
    if (!text) return "";

    let cleaned = text
      .replace(/\[CALL_COMPLETE\]/gi, "")
      .replace(/[*_#`~]/g, "")
      .trim();

    if (language === "fr") {
      cleaned = cleaned
        .replace(/\bDr\./gi, "Docteur")
        .replace(/\bDre\./gi, "Docteure")
        .replace(/\bM\./gi, "Monsieur")
        .replace(/\bMme\./gi, "Madame")
        .replace(/\bApt\./gi, "Rendez-vous")
        .replace(/\bPAT-(\d+)/gi, "P A T $1")
        .replace(/\bAPT-(\d+)/gi, "A P T $1");
    } else {
      cleaned = cleaned
        .replace(/\bDr\./gi, "Doctor")
        .replace(/\bApt\./gi, "Appointment")
        .replace(/\bSt\./gi, "Street")
        .replace(/\bPAT-(\d+)/gi, "P A T $1")
        .replace(/\bAPT-(\d+)/gi, "A P T $1");
    }

    return cleaned;
  }

  /**
   * XML entity escaping for safe TwiML injection.
   */
  public escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
