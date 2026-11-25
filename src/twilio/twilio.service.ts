import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';
import { ClinicsService } from '../clinics/clinics.service';

/**
 * Service responsible for interacting with Twilio Voice & SMS APIs and generating TwiML.
 * Configured with:
 * - Dynamic Clinic-Specific Twilio credentials & phone numbers
 * - Amazon Polly Neural voices (Danielle for en-US, Lea for fr-FR)
 * - Inbound & Outbound call workflows
 * - SMS sending and incoming SMS response parsing
 * - Bilingual scripts for English & French
 */
@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly defaultClient: twilio.Twilio;
  private readonly clinicClients = new Map<string, twilio.Twilio>();

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => ClinicsService))
    private readonly clinicsService: ClinicsService,
  ) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.defaultClient = this.createClient(accountSid, authToken);
  }

  private createClient(accountSid?: string, authToken?: string): twilio.Twilio {
    const factory: any = (twilio as any).default || twilio;
    return typeof factory === 'function' ? factory(accountSid, authToken) : new factory(accountSid, authToken);
  }

  /**
   * Resolves the appropriate Twilio Client and caller phone number
   * using clinic-specific credentials if available, otherwise defaulting to system credentials.
   */
  public async getClientForClinic(clinicId?: string): Promise<{
    client: twilio.Twilio;
    fromNumber: string;
  }> {
    const defaultFrom = this.configService.get<string>('TWILIO_PHONE_NUMBER');

    if (!clinicId) {
      return { client: this.defaultClient, fromNumber: defaultFrom };
    }

    try {
      const clinic = await this.clinicsService.findById(clinicId);
      if (clinic?.twilioAccountSid && clinic?.twilioAuthToken) {
        if (!this.clinicClients.has(clinicId)) {
          this.clinicClients.set(
            clinicId,
            this.createClient(clinic.twilioAccountSid, clinic.twilioAuthToken),
          );
        }
        return {
          client: this.clinicClients.get(clinicId)!,
          fromNumber: clinic.twilioPhoneNumber || defaultFrom,
        };
      }

      if (clinic?.twilioPhoneNumber) {
        return { client: this.defaultClient, fromNumber: clinic.twilioPhoneNumber };
      }
    } catch (err: any) {
      this.logger.warn(`Could not resolve clinic credentials for ${clinicId}: ${err?.message}`);
    }

    return { client: this.defaultClient, fromNumber: defaultFrom };
  }

  /**
   * Initiates an outbound telephone call with clinic-specific credentials.
   */
  public async createOutboundCall(
    to: string,
    webhookBaseUrl: string,
    aiCallId: string,
    clinicId?: string,
  ): Promise<{ callSid: string }> {
    try {
      const { client, fromNumber } = await this.getClientForClinic(clinicId);
      this.logger.log(
        `Creating outbound call to [REDACTED] from ${fromNumber} for callId=${aiCallId} (clinic=${clinicId || 'default'})`,
      );

      const call = await client.calls.create({
        to,
        from: fromNumber,
        url: `${webhookBaseUrl}/ai-call/twilio/voice?callId=${aiCallId}`,
        statusCallback: `${webhookBaseUrl}/ai-call/twilio/status`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        machineDetection: 'Enable',
      });

      this.logger.log(`Outbound call created: SID=${call.sid}`);
      return { callSid: call.sid };
    } catch (error: any) {
      this.logger.error('Failed to create outbound Twilio call', error?.message);
      throw error;
    }
  }

  /**
   * Sends an SMS message to a patient via Twilio.
   */
  public async sendSms(
    to: string,
    body: string,
    clinicId?: string,
  ): Promise<{ messageSid: string; success: boolean }> {
    try {
      const { client, fromNumber } = await this.getClientForClinic(clinicId);
      this.logger.log(`Sending SMS to [REDACTED] from ${fromNumber}: "${body.substring(0, 50)}..."`);

      const message = await client.messages.create({
        to,
        from: fromNumber,
        body,
      });

      return { messageSid: message.sid, success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send SMS to ${to}: ${error?.message}`);
      return { messageSid: '', success: false };
    }
  }

  /**
   * Validates cryptographic signature of incoming Twilio requests.
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
      this.logger.error('Error validating Twilio webhook signature', error);
      return false;
    }
  }

  /**
   * Turn 1 Language Selection TwiML for Outbound Calls.
   */
  public generateLanguageSelectionTwiML(actionUrl: string): string {
    const separator = actionUrl.includes('?') ? '&amp;' : '?';
    const fallbackRedirectUrl = `${actionUrl}${separator}defaultLang=en`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" action="${actionUrl}" method="POST" language="en-US" bargeIn="false" speechTimeout="auto" timeout="6" hints="English, French, Français, one, two, un, deux">
    <Say voice="Polly.Danielle-Neural" language="en-US">For English, press 1 or say English. For French, press 2 or say French.</Say>
    <Say voice="Polly.Lea-Neural" language="fr-FR">Pour le français, appuyez sur 2 ou dites Français.</Say>
  </Gather>
  <Say voice="Polly.Danielle-Neural" language="en-US">I didn't hear a response. Continuing in English.</Say>
  <Redirect method="POST">${fallbackRedirectUrl}</Redirect>
</Response>`;
  }

  /**
   * TwiML for Inbound Calls from Patients.
   */
  public generateIncomingCallTwiML(actionUrl: string, clinicName: string = 'our medical clinic'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" action="${actionUrl}" method="POST" language="en-US" bargeIn="false" speechTimeout="auto" timeout="6" hints="English, French, Français, one, two, un, deux">
    <Say voice="Polly.Danielle-Neural" language="en-US">Thank you for calling ${clinicName}. For English, press 1 or say English. For French, press 2 or say French.</Say>
    <Say voice="Polly.Lea-Neural" language="fr-FR">Merci d'avoir appelé notre clinique. Pour le français, appuyez sur 2 ou dites Français.</Say>
  </Gather>
  <Say voice="Polly.Danielle-Neural" language="en-US">Continuing in English.</Say>
  <Redirect method="POST">${actionUrl}?defaultLang=en</Redirect>
</Response>`;
  }

  /**
   * Scenario 3: Approved Voicemail TwiML when patient does not answer.
   */
  public generateVoicemailTwiML(clinicName: string = 'our medical clinic', language: string = 'en'): string {
    const isFrench = language === 'fr';
    const voice = isFrench ? 'Polly.Lea-Neural' : 'Polly.Danielle-Neural';
    const lang = isFrench ? 'fr-FR' : 'en-US';

    const message = isFrench
      ? `Bonjour, ici le secrétariat médical automatisé de ${clinicName}. Nous vous appelons concernant votre rendez-vous. Nous vous avons également envoyé un SMS. Veuillez répondre à notre SMS ou nous rappeler pour confirmer ou modifier votre rendez-vous. Merci et bonne journée.`
      : `Hello, this is the automated scheduling assistant calling from ${clinicName}. We are calling regarding your medical appointment. We have also sent you a text message. Please reply to our SMS or call us back to confirm or schedule your appointment. Thank you and have a wonderful day.`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${message}</Say>
  <Hangup/>
</Response>`;
  }

  /**
   * Multi-turn conversational TwiML generator.
   */
  public generateGatherTwiML(text: string, actionUrl: string, language?: string): string {
    const isFrench = language === 'fr';
    const lang = isFrench ? 'fr-FR' : 'en-US';
    const voice = isFrench ? 'Polly.Lea-Neural' : 'Polly.Danielle-Neural';
    const speechModel = 'phone_call';

    const hints = isFrench
      ? 'confirmer, annuler, reporter, oui, non, francais, Docteur, rendez-vous, matin, apres-midi, lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche, satisfait, merci, au revoir, un, deux, trois, quatre, cinq'
      : 'confirm, cancel, reschedule, yes, no, English, Doctor, appointment, morning, afternoon, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, satisfied, thank you, goodbye, one, two, three, four, five';

    const fallbackNoInput = isFrench
      ? "Je n'ai pas entendu de réponse. Au revoir."
      : "I didn't hear a response. Goodbye.";

    const normalized = this.normalizeForTTS(text, language);
    const escaped = this.escapeXml(normalized);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" action="${actionUrl}" method="POST" language="${lang}" speechModel="${speechModel}" enhanced="true" speechTimeout="2" timeout="8" profanityFilter="false" bargeIn="false" hints="${hints}">
    <Say voice="${voice}" language="${lang}">${escaped}</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">${fallbackNoInput}</Say>
  <Hangup/>
</Response>`;
  }

  public generateHangupTwiML(text: string, language?: string): string {
    const isFrench = language === 'fr';
    const lang = isFrench ? 'fr-FR' : 'en-US';
    const voice = isFrench ? 'Polly.Lea-Neural' : 'Polly.Danielle-Neural';
    const normalized = this.normalizeForTTS(text, language);
    const escaped = this.escapeXml(normalized);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${escaped}</Say>
  <Hangup/>
</Response>`;
  }

  private normalizeForTTS(text: string, language?: string): string {
    if (!text) return '';
    let result = text;
    if (language === 'fr') {
      result = result
        .replace(/\bDr\.?\s+/gi, 'Docteur ')
        .replace(/\bM\.\s+/gi, 'Monsieur ')
        .replace(/\bMme\.\s+/gi, 'Madame ');
    } else {
      result = result
        .replace(/\bDr\.?\s+/gi, 'Doctor ')
        .replace(/\bSt\.?\s+/gi, 'Street ')
        .replace(/\bAve\.?\s+/gi, 'Avenue ');
    }
    return result;
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
