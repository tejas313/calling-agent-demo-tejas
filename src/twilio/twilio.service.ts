import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as twilio from "twilio";

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly client: twilio.Twilio;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>("TWILIO_ACCOUNT_SID");
    const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN");
    this.client = twilio.default(accountSid, authToken);
  }

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

  public generateTwiML(text: string, language?: string): string {
    const lang = language === 'fr' ? 'fr-FR' : 'en-US';
    const escaped = this.escapeXml(text);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="${lang}">${escaped}</Say>
  <Hangup/>
</Response>`;
  }

  public generateGatherTwiML(
    text: string,
    actionUrl: string,
    language?: string,
  ): string {
    const lang = language === 'fr' ? 'fr-FR' : 'en-US';
    const escaped = this.escapeXml(text);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionUrl}" method="POST" language="${lang}" speechModel="phone_call" speechTimeout="auto" timeout="5">
    <Say voice="alice" language="${lang}">${escaped}</Say>
  </Gather>
  <Say voice="alice" language="${lang}">I didn't hear a response. Goodbye.</Say>
  <Hangup/>
</Response>`;
  }

  public generateHangupTwiML(text: string, language?: string): string {
    return this.generateTwiML(text, language);
  }

  public escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
