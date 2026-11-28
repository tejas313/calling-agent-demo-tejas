import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as twilio from "twilio";

/**
 * Service responsible for interacting with Twilio Voice APIs and generating TwiML.
 * Configured with:
 * - Amazon Polly Generative voices (configurable via TTS_VOICE_EN / TTS_VOICE_FR) for natural human inflection.
 * - Natural conversational pacing (default 100% native speech rate) for clear telephony comprehension.
 * - Fast silence cut-off (default speechTimeout=1s) so turns feel responsive.
 * - Dual-input mode (speech + DTMF keypad press) for high accuracy.
 * - Bilingual support for English and French.
 */
@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly client: twilio.Twilio;
  private readonly speechRate: string;
  private readonly speechTimeout: string;
  private readonly voiceEn: string;
  private readonly voiceFr: string;

  constructor(private readonly configService: ConfigService) {
    try {
      const accountSid = this.configService.get<string>("TWILIO_ACCOUNT_SID");
      const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN");
      const twilioFactory = (twilio as any).default || twilio;
      this.client = twilioFactory(accountSid, authToken);
      const configuredRate = this.configService.get<string>("TTS_SPEECH_RATE")?.trim();
      this.speechRate = configuredRate || "100%";
      const configuredSpeechTimeout = this.configService.get<string>("STT_SPEECH_TIMEOUT")?.trim();
      this.speechTimeout = configuredSpeechTimeout || "1";
      const configuredVoiceEn = this.configService.get<string>("TTS_VOICE_EN")?.trim();
      this.voiceEn = configuredVoiceEn || "Polly.Danielle-Generative";
      const configuredVoiceFr = this.configService.get<string>("TTS_VOICE_FR")?.trim();
      this.voiceFr = configuredVoiceFr || "Polly.Lea-Generative";
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
      const escapedActionUrl = this.escapeXml(actionUrl);
      const separator = escapedActionUrl.includes("?") ? "&amp;" : "?";
      const fallbackRedirectUrl = `${escapedActionUrl}${separator}defaultLang=en`;
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

      this.logger.log(
        `[TwilioService] 🔊 Language selection TwiML: playing bilingual English + French prompt`,
      );
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" action="${escapedActionUrl}" actionOnEmptyResult="true" method="POST" language="en-US" speechModel="phone_call" enhanced="true" bargeIn="false" speechTimeout="${this.speechTimeout}" timeout="8" hints="English, French, Français, press one, press two, one, two, un, deux">
    <Say voice="${this.voiceEn}" language="en-US">${enPrompt}</Say>
    <Say voice="${this.voiceFr}" language="fr-FR">${frPrompt}</Say>
  </Gather>
  <Say voice="${this.voiceEn}" language="en-US">${fallbackPrompt}</Say>
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
      const voice = isFrench ? this.voiceFr : this.voiceEn;
      const speechModel = isFrench ? "default" : "phone_call";

      const baseHints = isFrench
        ? [
            "oui je confirme ce rendez-vous",
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
            "yes confirm this appointment",
            "confirm this appointment",
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
            "cancel this appointment",
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
        .map((h) => h.replace(/[<>&"',]/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const seenHints = new Set<string>();
      const allHints = [...sanitizedExtra, ...baseHints].filter((h) => {
        const key = h.toLowerCase();
        if (seenHints.has(key)) return false;
        seenHints.add(key);
        return true;
      });
      const boundedHints: string[] = [];
      let totalLen = 0;
      for (const hint of allHints) {
        const addition = boundedHints.length === 0 ? hint.length : hint.length + 2;
        if (totalLen + addition > 500) break;
        boundedHints.push(hint);
        totalLen += addition;
      }
      const hints = boundedHints.join(", ");

      const sayBody = this.formatSayBody(text, language);
      const enhancedAttr = speechModel === "phone_call" ? ' enhanced="true"' : "";
      const escapedActionUrl = this.escapeXml(actionUrl);
      const escapedHints = this.escapeXml(hints);

      this.logger.log(`[TwilioService] 🔊 Gather <Say> [${voice}]: "${text}"`);
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" action="${escapedActionUrl}" actionOnEmptyResult="true" method="POST" language="${lang}" speechModel="${speechModel}"${enhancedAttr} speechTimeout="${this.speechTimeout}" timeout="10" profanityFilter="false" bargeIn="true" hints="${escapedHints}">
    <Say voice="${voice}" language="${lang}">${sayBody}</Say>
  </Gather>
  <Redirect method="POST">${escapedActionUrl}</Redirect>
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
      const voice = isFrench ? this.voiceFr : this.voiceEn;
      const sayBody = this.formatSayBody(text, language);

      this.logger.log(`[TwilioService] 🔊 Final <Say> [${voice}]: "${text}"`);
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
      const voice = isFrench ? this.voiceFr : this.voiceEn;
      const holdText = isFrench
        ? "Un instant s'il vous plaît."
        : "One moment please.";
      const sayBody = this.formatSayBody(holdText, language);

      return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${voice}" language="${lang}">${sayBody}</Say><Pause length="1"/><Redirect method="POST">${this.escapeXml(pollUrl)}</Redirect></Response>`;
    } catch (error: any) {
      this.logger.error(`Error in generateHoldTwiML: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  public generatePollWaitTwiML(pollUrl: string): string {
    try {
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Redirect method="POST">${this.escapeXml(pollUrl)}</Redirect></Response>`;
    } catch (error: any) {
      this.logger.error(`Error in generatePollWaitTwiML: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  public generateHangupTwiML(text: string, language?: string): string {
    return this.generateTwiML(text, language);
  }

  /**
   * Normalizes text, escapes XML entities, wraps phone numbers in SSML <say-as>,
   * and applies <prosody rate="..."> only when a custom non-100% rate is configured
   * so Polly Generative voices retain their natural human cadence and intonation.
   */
  public formatSayBody(text: string, language?: string): string {
    try {
      const normalized = this.normalizeForTTS(text, language);
      const escaped = this.escapeXml(normalized);
      const withPhones = escaped.replace(
        /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
        (match) => `<say-as interpret-as="telephone">${match}</say-as>`,
      );
      const normalizedRate = this.speechRate.toLowerCase();
      if (!normalizedRate || normalizedRate === "100%" || normalizedRate === "normal" || normalizedRate === "medium") {
        return withPhones;
      }
      return `<prosody rate="${this.speechRate}">${withPhones}</prosody>`;
    } catch (error: any) {
      this.logger.error(`Error in formatSayBody: ${error?.message}`, error?.stack);
      return this.escapeXml(text || '');
    }
  }

  /**
   * Pre-formats raw text into speakable phonetics for Text-to-Speech:
   * - Strips markdown formatting (*, #, _) and internal control tokens.
   * - Expands medical/address abbreviations (Dr./Dr -> Doctor / Docteur, Ste. -> Suite, etc.).
   * - Formats 12-hour times (09:00 AM -> 9 AM, 09:30 AM -> 9:30 AM) so Polly Neural doesn't read leading zeros.
   * - Normalizes patient/appointment IDs for clear letter-by-letter pronunciation.
   */
  public normalizeForTTS(text: string, language?: string): string {
    try {
      if (!text) return "";

      let cleaned = text
        .replace(/\[CALL_COMPLETE\]|\[SLOT_CONFIRMED\]|\[SLOT_CANCELLED\]|\[INTENT_CONFIRM\]|\[INTENT_CANCEL\]|\[INTENT_YES\]|\[INTENT_NO\]|\[INTENT_RESCHEDULE\]|\[INTENT_CALL_LATER\]/gi, "")
        .replace(/[*_#`~]/g, "")
        .trim();

      if (language === "fr") {
        cleaned = cleaned
          .replace(/\bDr\.?(?=\s)/gi, "Docteur")
          .replace(/\bDre\.?(?=\s)/gi, "Docteure")
          .replace(/\bM\.(?=\s)/gi, "Monsieur")
          .replace(/\bMme\.?(?=\s)/gi, "Madame")
          .replace(/\bApt\.?(?=\s)/gi, "Rendez-vous")
          .replace(/\bTél\.?(?=\s|:)/gi, "Téléphone")
          .replace(/\b0?(\d{1,2})\s+heures\s+00\b/gi, "$1 heures")
          .replace(/\b0(\d)\s+heures\s+(\d{2})\b/gi, "$1 heures $2")
          .replace(/\bPAT-(\d+)/gi, "P A T $1")
          .replace(/\bAPT-(\d+)/gi, "A P T $1");
      } else {
        cleaned = cleaned
          .replace(/\bDr\.?(?=\s)/gi, "Doctor")
          .replace(/\bMr\.?(?=\s)/gi, "Mister")
          .replace(/\bMrs\.?(?=\s)/gi, "Missus")
          .replace(/\bMs\.?(?=\s)/gi, "Miss")
          .replace(/\bApt\.?(?=\s)/gi, "Appointment")
          .replace(/\bSte\.?(?=\s)/gi, "Suite")
          .replace(/\bDept\.?(?=\s)/gi, "Department")
          .replace(/\bExt\.?(?=\s|:)/gi, "Extension")
          .replace(/\bSt\.(?=\s|,|$)/gi, "Street")
          .replace(/\bAve\.?(?=\s|,|$)/gi, "Avenue")
          .replace(/\bRd\.?(?=\s|,|$)/gi, "Road")
          .replace(/\bBlvd\.?(?=\s|,|$)/gi, "Boulevard")
          .replace(/\b0?(\d{1,2}):00\s*(AM|PM)\b/gi, "$1 $2")
          .replace(/\b0(\d):(\d{2})\s*(AM|PM)\b/gi, "$1:$2 $3")
          .replace(/\bPAT-(\d+)/gi, "P A T $1")
          .replace(/\bAPT-(\d+)/gi, "A P T $1");
      }

      return cleaned.replace(/\s+/g, " ").trim();
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
