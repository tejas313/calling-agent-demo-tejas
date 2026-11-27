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
  private readonly speechRate: string;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>("TWILIO_ACCOUNT_SID");
    const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN");
    const twilioFactory = (twilio as any).default || twilio;
    this.client = twilioFactory(accountSid, authToken);
    const configuredRate = this.configService.get<string>("TTS_SPEECH_RATE")?.trim();
    this.speechRate = configuredRate || "88%";
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
   * - English: "For English, press 1 or say English. For French, press 2 or say French." (Polly.Danielle-Neural)
   * - French: "Pour le français, appuyez sur 2 ou dites Français." (Polly.Lea-Neural)
   *
   * Features:
   * - bargeIn="false": Guaranteed full instruction playback without being cut off by phone pickup noise or echo.
   * - speechTimeout="auto": Intelligent silence detection prevents premature cutoffs.
   * - Fallback: Gracefully defaults to English if no response after 6 seconds.
   */
  public generateLanguageSelectionTwiML(actionUrl: string): string {
    const separator = actionUrl.includes("?") ? "&amp;" : "?";
    const fallbackRedirectUrl = `${actionUrl}${separator}defaultLang=en`;
    const enPrompt = this.formatSayBody(
      "For English, press 1 or say English. For French, press 2 or say French.",
      "en",
    );
    const frPrompt = this.formatSayBody(
      "Pour le français, appuyez sur 2 ou dites Français.",
      "fr",
    );
    const fallbackPrompt = this.formatSayBody(
      "I didn't hear a response. Continuing in English.",
      "en",
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" action="${actionUrl}" method="POST" language="en-US" speechModel="phone_call" enhanced="true" bargeIn="false" speechTimeout="1" timeout="6" hints="English, French, Français, one, two, un, deux">
    <Say voice="Polly.Danielle-Neural" language="en-US">${enPrompt}</Say>
    <Say voice="Polly.Lea-Neural" language="fr-FR">${frPrompt}</Say>
  </Gather>
  <Say voice="Polly.Danielle-Neural" language="en-US">${fallbackPrompt}</Say>
  <Redirect method="POST">${fallbackRedirectUrl}</Redirect>
</Response>`;
  }

  /**
   * Generates multi-turn conversational TwiML.
   *
   * Architecture: Seamless Gather with nested <Say>, natural SSML pacing, and fast 1s end-of-speech cutoff.
   */
  public generateGatherTwiML(
    text: string,
    actionUrl: string,
    language?: string,
  ): string {
    const isFrench = language === "fr";
    const lang = isFrench ? "fr-FR" : "en-US";
    const voice = isFrench ? "Polly.Lea-Neural" : "Polly.Danielle-Neural";
    const speechModel = "phone_call";

    const hints = isFrench
      ? "confirmer, annuler, oui, non, francais, Docteur, rendez-vous, clinique, patient, matin, apres-midi, lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche, merci, au revoir, un, deux, trois"
      : "confirm, cancel, yes, no, English, Doctor, appointment, clinic, patient, morning, afternoon, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, thank you, goodbye, one, two, three";

    const fallbackNoInput = isFrench
      ? "Je n'ai pas entendu de réponse. Au revoir."
      : "I didn't hear a response. Goodbye.";

    const sayBody = this.formatSayBody(text, language);
    const fallbackBody = this.formatSayBody(fallbackNoInput, language);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" action="${actionUrl}" method="POST" language="${lang}" speechModel="${speechModel}" enhanced="true" speechTimeout="1" timeout="8" profanityFilter="false" bargeIn="false" hints="${hints}">
    <Say voice="${voice}" language="${lang}">${sayBody}</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">${fallbackBody}</Say>
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
    const sayBody = this.formatSayBody(text, language);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${sayBody}</Say>
  <Hangup/>
</Response>`;
  }

  public generateHoldTwiML(pollUrl: string, language?: string): string {
    const isFrench = language === "fr";
    const lang = isFrench ? "fr-FR" : "en-US";
    const voice = isFrench ? "Polly.Lea-Neural" : "Polly.Danielle-Neural";
    const holdText = isFrench
      ? "Un instant s'il vous plaît."
      : "One moment please.";
    const sayBody = this.formatSayBody(holdText, language);

    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${voice}" language="${lang}">${sayBody}</Say><Pause length="1"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
  }

  public generatePollWaitTwiML(pollUrl: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
  }

  public generateHangupTwiML(text: string, language?: string): string {
    return this.generateTwiML(text, language);
  }

  /**
   * Normalizes text, escapes XML entities, inserts short pauses between sentences,
   * and wraps in SSML <prosody rate="..."> so Polly Neural speaks at a natural pace.
   */
  public formatSayBody(text: string, language?: string): string {
    const normalized = this.normalizeForTTS(text, language);
    const escaped = this.escapeXml(normalized);
    const withBreaks = escaped.replace(/([.!?])\s+/g, '$1 <break time="220ms"/> ');
    return `<prosody rate="${this.speechRate}">${withBreaks}</prosody>`;
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
      .replace(/\[CALL_COMPLETE\]|\[SLOT_CONFIRMED\]|\[SLOT_CANCELLED\]|\[INTENT_CONFIRM\]|\[INTENT_CANCEL\]|\[INTENT_YES\]|\[INTENT_NO\]/gi, "")
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
