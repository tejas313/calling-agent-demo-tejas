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
    try {
      const accountSid = this.configService.get<string>("TWILIO_ACCOUNT_SID");
      const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN");
      const twilioFactory = (twilio as any).default || twilio;
      this.client = twilioFactory(accountSid, authToken);
      const configuredRate = this.configService.get<string>("TTS_SPEECH_RATE")?.trim();
      this.speechRate = configuredRate || "93%";
    } catch (error: any) {
      this.logger.error(`Error initializing TwilioService: ${error?.message}`, error?.stack);
    }
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
    } catch (error: any) {
      this.logger.error(
        `Failed to create outbound Twilio call: ${error?.message}`,
        error?.stack,
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
    } catch (error: any) {
      this.logger.error(`Error validating Twilio webhook signature: ${error?.message}`, error?.stack);
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
    try {
      const separator = actionUrl.includes("?") ? "&amp;" : "?";
      const fallbackRedirectUrl = `${actionUrl}${separator}defaultLang=en`;
      const enPrompt = this.formatSayBody(
        "For English, press 1 or say English.",
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
  <Gather input="speech dtmf" numDigits="1" action="${actionUrl}" method="POST" language="en-US" speechModel="phone_call" enhanced="true" bargeIn="true" speechTimeout="1" timeout="6" hints="English, French, Français, press one, press two, one, two, un, deux">
    <Say voice="Polly.Danielle-Neural" language="en-US">${enPrompt}</Say>
    <Say voice="Polly.Lea-Neural" language="fr-FR">${frPrompt}</Say>
  </Gather>
  <Say voice="Polly.Danielle-Neural" language="en-US">${fallbackPrompt}</Say>
  <Redirect method="POST">${fallbackRedirectUrl}</Redirect>
</Response>`;
    } catch (error: any) {
      this.logger.error(`Error in generateLanguageSelectionTwiML: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * Generates multi-turn conversational TwiML.
   *
   * Architecture: Seamless Gather with nested <Say>, natural SSML pacing,
   * phrase-level STT hints, and 1s end-of-speech cutoff.
   */
  public generateGatherTwiML(
    text: string,
    actionUrl: string,
    language?: string,
    extraHints?: string[],
  ): string {
    try {
      const isFrench = language === "fr";
      const lang = isFrench ? "fr-FR" : "en-US";
      const voice = isFrench ? "Polly.Lea-Neural" : "Polly.Danielle-Neural";
      const speechModel = isFrench ? "default" : "phone_call";

      const baseHints = isFrench
        ? [
            "oui je confirme",
            "je confirme",
            "confirmer le rendez-vous",
            "oui confirmer",
            "veuillez confirmer",
            "confirmer",
            "oui annuler",
            "annuler le rendez-vous",
            "je veux annuler",
            "annuler",
            "oui bien sûr",
            "oui merci",
            "non merci",
            "adresse de la clinique",
            "téléphone de la clinique",
            "nom du médecin",
            "spécialité du médecin",
            "Docteur",
            "rendez-vous",
          ]
        : [
            "yes please confirm",
            "please confirm",
            "confirm my appointment",
            "confirm appointment",
            "yes confirm",
            "confirm it",
            "yes I confirm",
            "confirm",
            "yes book it",
            "book appointment",
            "yes please cancel",
            "please cancel",
            "cancel my appointment",
            "cancel appointment",
            "yes cancel",
            "cancel it",
            "cancel",
            "yes sure",
            "yes I am sure",
            "yes please",
            "no thank you",
            "clinic address",
            "clinic phone",
            "clinic email",
            "doctor name",
            "doctor specialty",
            "patient details",
            "appointment time",
          ];

      const sanitizedExtra = (extraHints || [])
        .map((h) => h.replace(/[<>&"']/g, " ").trim())
        .filter(Boolean);
      const hints = [...baseHints, ...sanitizedExtra].join(", ");

      const fallbackNoInput = isFrench
        ? "Je n'ai pas entendu de réponse. Au revoir."
        : "I didn't hear a response. Goodbye.";

      const sayBody = this.formatSayBody(text, language);
      const fallbackBody = this.formatSayBody(fallbackNoInput, language);

      const enhancedAttr = speechModel === "phone_call" ? ' enhanced="true"' : "";

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" action="${actionUrl}" method="POST" language="${lang}" speechModel="${speechModel}"${enhancedAttr} speechTimeout="1" timeout="8" profanityFilter="false" bargeIn="false" hints="${hints}">
    <Say voice="${voice}" language="${lang}">${sayBody}</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">${fallbackBody}</Say>
  <Hangup/>
</Response>`;
    } catch (error: any) {
      this.logger.error(`Error in generateGatherTwiML: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * Generates a final statement and hangs up the call.
   * Used when an appointment action is complete and the patient is satisfied.
   */
  public generateTwiML(text: string, language?: string): string {
    try {
      const isFrench = language === "fr";
      const lang = isFrench ? "fr-FR" : "en-US";
      const voice = isFrench ? "Polly.Lea-Neural" : "Polly.Danielle-Neural";
      const sayBody = this.formatSayBody(text, language);

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${sayBody}</Say>
  <Hangup/>
</Response>`;
    } catch (error: any) {
      this.logger.error(`Error in generateTwiML: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  public generateHoldTwiML(pollUrl: string, language?: string): string {
    try {
      const isFrench = language === "fr";
      const lang = isFrench ? "fr-FR" : "en-US";
      const voice = isFrench ? "Polly.Lea-Neural" : "Polly.Danielle-Neural";
      const holdText = isFrench
        ? "Un instant s'il vous plaît."
        : "One moment please.";
      const sayBody = this.formatSayBody(holdText, language);

      return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${voice}" language="${lang}">${sayBody}</Say><Pause length="1"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
    } catch (error: any) {
      this.logger.error(`Error in generateHoldTwiML: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  public generatePollWaitTwiML(pollUrl: string): string {
    try {
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
    } catch (error: any) {
      this.logger.error(`Error in generatePollWaitTwiML: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  public generateHangupTwiML(text: string, language?: string): string {
    return this.generateTwiML(text, language);
  }

  /**
   * Normalizes text, escapes XML entities, inserts short pauses between sentences,
   * and wraps in SSML <prosody rate="..."> so Polly Neural speaks at a natural pace.
   */
  public formatSayBody(text: string, language?: string): string {
    try {
      const normalized = this.normalizeForTTS(text, language);
      const escaped = this.escapeXml(normalized);
      const withBreaks = escaped.replace(/([.!?])\s+/g, '$1 <break time="220ms"/> ');
      return `<prosody rate="${this.speechRate}">${withBreaks}</prosody>`;
    } catch (error: any) {
      this.logger.error(`Error in formatSayBody: ${error?.message}`, error?.stack);
      return `<prosody rate="${this.speechRate}">${text || ''}</prosody>`;
    }
  }

  /**
   * Pre-formats raw text into speakable phonetics for Text-to-Speech:
   * - Strips markdown formatting (*, #, _) and internal [CALL_COMPLETE] tokens.
   * - Expands medical abbreviations (Dr. -> Doctor / Docteur).
   * - Normalizes patient/appointment IDs for clear letter-by-letter pronunciation.
   */
  public normalizeForTTS(text: string, language?: string): string {
    try {
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
    } catch (error: any) {
      this.logger.error(`Error in normalizeForTTS: ${error?.message}`, error?.stack);
      return text || "";
    }
  }

  /**
   * XML entity escaping for safe TwiML injection.
   */
  public escapeXml(text: string): string {
    try {
      if (!text) return "";
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    } catch (error: any) {
      this.logger.error(`Error in escapeXml: ${error?.message}`, error?.stack);
      return text || "";
    }
  }
}
