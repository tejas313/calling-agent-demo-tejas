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
    description:
      'Initiates an outbound Twilio call and starts the AI appointment confirmation agent',
  })
  @ApiBody({ type: StartCallDto })
  @ApiResponse({
    status: 201,
    description: 'Call initiated successfully',
    schema: {
      example: { success: true, callId: 'uuid', twilioCallSid: 'CAxxxxx', status: 'initiated' },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async startCall(@Body() dto: StartCallDto) {
    return this.aiCallService.startCall(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get AI call record' })
  @ApiResponse({ status: 200, description: 'Call record' })
  @ApiResponse({ status: 404, description: 'Call not found' })
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
    this.logger.log(`[POLL] 🔍 Poll request for callId=${callId}`);
    try {
      const twiml = await this.aiCallService.handlePollWebhook(callId);
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      this.logger.error(`[POLL] ❌ Error: ${error?.message}`);
      const fallback = '<Response><Say voice="alice">We are experiencing technical difficulties. Goodbye.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(fallback);
    }
  }

  @SkipThrottle()
  @Post('twilio/voice')
  @HttpCode(200)
  @ApiOperation({ summary: 'Twilio voice webhook - handles incoming speech from patient' })
  async handleVoiceWebhook(
    @Query('callId') callId: string,
    @Body() body: TwilioVoiceDto,
    @Res() res: Response,
  ) {
    if (body?.SpeechResult) {
      this.logger.log(`\n==================================================\n🎤 [CALLER SPOKE]\n🗣️ Text: "${body.SpeechResult}"\n📊 Confidence: ${body.Confidence || 'N/A'}\n🆔 CallId: ${callId}\n==================================================`);
    } else {
      this.logger.log(`[WEBHOOK] Call connected / Turn initiated — CallSid=${body?.CallSid}, CallId=${callId}`);
    }

    if (!callId) {
      this.logger.error('[WEBHOOK] ❌ No callId in query params — Twilio webhook URL is misconfigured!');
      const twiml = '<Response><Say>Invalid call configuration.</Say><Hangup/></Response>';
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    }

    try {
      const twiml = await this.aiCallService.handleVoiceWebhook(
        callId,
        body.SpeechResult,
        body.CallSid || '',
      );
      res.setHeader('Content-Type', 'text/xml');
      return res.send(twiml);
    } catch (error: any) {
      this.logger.error(`[WEBHOOK] ❌ FATAL ERROR in handleVoiceWebhook for callId=${callId}: ${error?.message}`, error?.stack);
      const fallbackTwiml =
        '<Response><Say voice="alice">We are experiencing technical difficulties. Please call the clinic directly. Goodbye.</Say><Hangup/></Response>';
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
