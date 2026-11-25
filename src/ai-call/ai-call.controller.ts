import { Controller, Post, Get, Body, Param, Query, Res, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AiCallService } from './ai-call.service';
import { StartCallDto } from './dto/start-call.dto';
import { TwilioVoiceDto } from './dto/twilio-voice.dto';
import { TwilioStatusDto } from './dto/twilio-status.dto';

@ApiTags('AI Call')
@Controller('ai-call')
export class AiCallController {
  private readonly logger = new Logger(AiCallController.name);

  constructor(private readonly aiCallService: AiCallService) {}

  @Post('start')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Start an AI outbound call',
    description: 'Initiates an outbound Twilio call using clinic-specific credentials',
  })
  @ApiBody({ type: StartCallDto })
  async startCall(@Body() dto: StartCallDto) {
    return this.aiCallService.startCall(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get AI call record' })
  async getCall(@Param('id') id: string) {
    return this.aiCallService.getCall(id);
  }

  @Get(':id/transcript')
  @ApiOperation({ summary: 'Get call transcript' })
  async getTranscript(@Param('id') id: string) {
    return this.aiCallService.getTranscript(id);
  }

  @SkipThrottle()
  @Post('twilio/poll')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio poll endpoint — called repeatedly until AI response is ready' })
  async handlePollWebhook(
    @Query('callId') callId: string,
    @Res() res: Response,
  ) {
    try {
      const twiml = await this.aiCallService.handlePollWebhook(callId);
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      this.logger.error(`[POLL] Error: ${error?.message}`);
      const fallback =
        '<Response><Say voice="Polly.Danielle-Neural" language="en-US">We are experiencing technical difficulties. Goodbye.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(fallback);
    }
  }

  @SkipThrottle()
  @Post('twilio/incoming')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Twilio Incoming Call Webhook',
    description: 'Triggered when a patient calls the clinic phone number directly',
  })
  async handleIncomingCall(
    @Body() body: any,
    @Res() res: Response,
  ) {
    const from = body?.From || '';
    const to = body?.To || '';
    const callSid = body?.CallSid || '';

    try {
      const twiml = await this.aiCallService.handleIncomingCall(from, to, callSid);
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      this.logger.error(`[INCOMING CALL] Error: ${error?.message}`);
      const fallback =
        '<Response><Say voice="Polly.Danielle-Neural" language="en-US">Thank you for calling. Our offices are currently closed. Goodbye.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(fallback);
    }
  }

  @SkipThrottle()
  @Post('twilio/sms')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Twilio Incoming SMS Webhook (Scenario 19 & 20)',
    description: 'Handles patient text responses (YES/NO/ambiguous queries)',
  })
  async handleIncomingSms(
    @Body() body: any,
    @Res() res: Response,
  ) {
    const from = body?.From || '';
    const to = body?.To || '';
    const text = body?.Body || '';
    const messageSid = body?.MessageSid || '';

    try {
      const result = await this.aiCallService.handleIncomingSms(from, to, text, messageSid);
      const twiml = `<Response><Message>${result.responseText}</Message></Response>`;
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      this.logger.error(`[INCOMING SMS] Error: ${error?.message}`);
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }
  }

  @SkipThrottle()
  @Post('twilio/voice')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio voice webhook - handles speech and DTMF keypad' })
  async handleVoiceWebhook(
    @Query('callId') rawCallId: string,
    @Query('defaultLang') defaultLang: string,
    @Body() body: TwilioVoiceDto,
    @Res() res: Response,
  ) {
    const callId = rawCallId ? rawCallId.split('?')[0].split('&')[0].trim() : '';

    if (!callId) {
      this.logger.error('[WEBHOOK] No callId in query params');
      const twiml = '<Response><Say>Invalid call configuration.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    }

    try {
      const twiml = await this.aiCallService.handleVoiceWebhook(
        callId,
        body.SpeechResult,
        body.CallSid || '',
        body.Digits,
        body.Confidence,
        defaultLang,
      );
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      this.logger.error(`[WEBHOOK] Error: ${error?.message}`);
      const fallbackTwiml =
        '<Response><Say voice="Polly.Danielle-Neural" language="en-US">We are experiencing technical difficulties. Please call the clinic directly. Goodbye.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(fallbackTwiml);
    }
  }

  @SkipThrottle()
  @Post('twilio/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio status callback' })
  async handleStatusCallback(@Body() body: TwilioStatusDto) {
    await this.aiCallService.handleStatusCallback(body);
    return { received: true };
  }

  @SkipThrottle()
  @Post('twilio/recording')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio recording callback' })
  handleRecordingCallback(@Body() body: any) {
    this.logger.log(`Recording available for CallSid: ${body.CallSid}`);
    return { received: true };
  }
}
