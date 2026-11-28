import { Controller, Post, Get, Body, Param, Query, Res, Req, HttpCode, Logger, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AiCallService } from './ai-call.service';
import { ResponseService } from '../common/response.service';
import { TwilioService } from '../twilio/twilio.service';
import { StartCallDto } from './dto/start-call.dto';
import { TwilioVoiceDto } from './dto/twilio-voice.dto';
import { TwilioStatusDto } from './dto/twilio-status.dto';

@ApiTags('AI Call')
@Controller('ai-call')
export class AiCallController {
  private readonly logger = new Logger(AiCallController.name);

  constructor(
    private readonly aiCallService: AiCallService,
    private readonly responseService: ResponseService,
    @Optional()
    private readonly twilioService?: TwilioService,
  ) {}

  @Post('start')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Start an AI outbound call',
    description:
      'Initiates an outbound Twilio call and starts the AI appointment confirmation agent',
  })
  @ApiBody({ type: StartCallDto })
  @ApiResponse({
    status: 200,
    description: 'Call initiated successfully',
    schema: {
      example: { success: true, callId: 'uuid', twilioCallSid: 'CAxxxxx', status: 'initiated' },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async startCall(
    @Body() dto: StartCallDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const result = await this.aiCallService.startCall(dto);
      return this.responseService.success(res, 'CALL_INITIATED_SUCCESSFULLY', result);
    } catch (error: any) {
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'FAILED_TO_START_CALL', statusCode);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get AI call record' })
  @ApiResponse({ status: 200, description: 'Call record' })
  @ApiResponse({ status: 404, description: 'Call not found' })
  async getCall(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const result = await this.aiCallService.getCall(id);
      return this.responseService.success(res, 'CALL_RECORD_RETRIEVED_SUCCESSFULLY', result);
    } catch (error: any) {
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'CALL_NOT_FOUND', statusCode);
    }
  }

  @Get(':id/transcript')
  @ApiOperation({ summary: 'Get call transcript' })
  async getTranscript(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const result = await this.aiCallService.getTranscript(id);
      return this.responseService.success(res, 'TRANSCRIPT_RETRIEVED_SUCCESSFULLY', result);
    } catch (error: any) {
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'FAILED_TO_GET_TRANSCRIPT', statusCode);
    }
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get persistent call audit and error logs' })
  async getLogs(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const result = await this.aiCallService.getLogs(id);
      return this.responseService.success(res, 'LOGS_RETRIEVED_SUCCESSFULLY', result);
    } catch (error: any) {
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'FAILED_TO_GET_LOGS', statusCode);
    }
  }

  @SkipThrottle()
  @Post('twilio/poll')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio poll endpoint — called repeatedly until AI response is ready' })
  async handlePollWebhook(
    @Query('callId') callId: string,
    @Res() res: Response,
  ) {
    this.logger.log(`[POLL] 🔍 Poll request for callId=${callId}`);
    try {
      const twiml = await this.aiCallService.handlePollWebhook(callId);
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      this.logger.error(`[POLL] ❌ Error: ${error?.message}`);
      const fallback =
        this.twilioService?.generateTwiML(
          'We are experiencing technical difficulties. Goodbye.',
          'en',
        ) ||
        '<Response><Say voice="Polly.Danielle-Generative" language="en-US">We are experiencing technical difficulties. Goodbye.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(fallback);
    }
  }

  @SkipThrottle()
  @Post('twilio/voice')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio voice webhook - handles incoming speech or keypad DTMF from patient' })
  async handleVoiceWebhook(
    @Query('callId') rawCallId: string,
    @Query('defaultLang') defaultLang: string,
    @Body() body: TwilioVoiceDto,
    @Res() res: Response,
  ) {
    try {
      // Defensive sanitization: extract clean UUID in case query strings were chained or malformed
      const callId = rawCallId ? rawCallId.split('?')[0].split('&')[0].trim() : '';

      if (body?.SpeechResult) {
        this.logger.log(`\n==================================================\n🎤 [CALLER SPOKE]\n🗣️ Text: "${body.SpeechResult}"\n📊 Confidence: ${body.Confidence || 'N/A'}\n🆔 CallId: ${callId}\n==================================================`);
      } else if (body?.Digits) {
        this.logger.log(`\n==================================================\n🔢 [CALLER PRESSED KEYPAD]\n🔘 Digits: "${body.Digits}"\n🆔 CallId: ${callId}\n==================================================`);
      } else {
        this.logger.log(`[WEBHOOK] Call connected / Turn initiated — CallSid=${body?.CallSid}, CallId=${callId}`);
      }

      if (!callId) {
        this.logger.error('[WEBHOOK] ❌ No callId in query params — Twilio webhook URL is misconfigured!');
        const twiml = '<Response><Say>Invalid call configuration.</Say><Hangup/></Response>';
        res.setHeader('Content-Type', 'text/xml');
        return res.send(twiml);
      }

      const twiml = await this.aiCallService.handleVoiceWebhook(
        callId,
        body?.SpeechResult,
        body?.CallSid || '',
        body?.Digits,
        body?.Confidence,
        defaultLang,
      );
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      const callId = rawCallId ? rawCallId.split('?')[0].split('&')[0].trim() : '';
      this.logger.error(`[WEBHOOK] ❌ FATAL ERROR in handleVoiceWebhook for callId=${callId}: ${error?.message}`, error?.stack);
      const fallbackTwiml =
        this.twilioService?.generateTwiML(
          'We are experiencing technical difficulties. Please call the clinic directly. Goodbye.',
          'en',
        ) ||
        '<Response><Say voice="Polly.Danielle-Generative" language="en-US">We are experiencing technical difficulties. Please call the clinic directly. Goodbye.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(fallbackTwiml);
    }
  }

  @SkipThrottle()
  @Post('twilio/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio status callback' })
  async handleStatusCallback(
    @Body() body: TwilioStatusDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      await this.aiCallService.handleStatusCallback(body);
      return this.responseService.success(res, 'WEBHOOK_PROCESSED_SUCCESSFULLY', { received: true });
    } catch (error: any) {
      this.logger.error(`[STATUS_CALLBACK] ❌ Error: ${error?.message}`, error?.stack);
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'SOMETHING_WENT_WRONG', statusCode);
    }
  }

  @SkipThrottle()
  @Post('twilio/recording')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio recording callback' })
  handleRecordingCallback(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Recording available for CallSid: ${body?.CallSid}`);
      return this.responseService.success(res, 'WEBHOOK_PROCESSED_SUCCESSFULLY', { received: true });
    } catch (error: any) {
      this.logger.error(`[RECORDING_CALLBACK] ❌ Error: ${error?.message}`, error?.stack);
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'SOMETHING_WENT_WRONG', statusCode);
    }
  }
}
