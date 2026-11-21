"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AiCallController", {
    enumerable: true,
    get: function() {
        return AiCallController;
    }
});
const _common = require("@nestjs/common");
const _swagger = require("@nestjs/swagger");
const _express = require("express");
const _throttler = require("@nestjs/throttler");
const _aicallservice = require("./ai-call.service");
const _startcalldto = require("./dto/start-call.dto");
const _twiliovoicedto = require("./dto/twilio-voice.dto");
const _twiliostatusdto = require("./dto/twilio-status.dto");
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    } else {
        for(var i = decorators.length - 1; i >= 0; i--){
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(metadataKey, metadataValue);
    }
}
function _ts_param(paramIndex, decorator) {
    return function(target, key) {
        decorator(target, key, paramIndex);
    };
}
let AiCallController = class AiCallController {
    async startCall(dto) {
        return this.aiCallService.startCall(dto);
    }
    async getCall(id) {
        return this.aiCallService.getCall(id);
    }
    async getTranscript(id) {
        return this.aiCallService.getTranscript(id);
    }
    async handlePollWebhook(callId, res) {
        this.logger.log(`[POLL] 🔍 Poll request for callId=${callId}`);
        try {
            const twiml = await this.aiCallService.handlePollWebhook(callId);
            res.setHeader('Content-Type', 'text/xml');
            return res.send(twiml);
        } catch (error) {
            this.logger.error(`[POLL] ❌ Error: ${error?.message}`);
            const fallback = '<Response><Say voice="alice">We are experiencing technical difficulties. Goodbye.</Say><Hangup/></Response>';
            res.setHeader('Content-Type', 'text/xml');
            return res.send(fallback);
        }
    }
    async handleVoiceWebhook(callId, body, res) {
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
            const twiml = await this.aiCallService.handleVoiceWebhook(callId, body.SpeechResult, body.CallSid || '');
            res.setHeader('Content-Type', 'text/xml');
            return res.send(twiml);
        } catch (error) {
            this.logger.error(`[WEBHOOK] ❌ FATAL ERROR in handleVoiceWebhook for callId=${callId}: ${error?.message}`, error?.stack);
            const fallbackTwiml = '<Response><Say voice="alice">We are experiencing technical difficulties. Please call the clinic directly. Goodbye.</Say><Hangup/></Response>';
            res.setHeader('Content-Type', 'text/xml');
            return res.send(fallbackTwiml);
        }
    }
    async handleStatusCallback(body) {
        await this.aiCallService.handleStatusCallback(body);
        return {
            received: true
        };
    }
    handleRecordingCallback(body) {
        this.logger.log(`Recording available for CallSid: ${body.CallSid}`);
        return {
            received: true
        };
    }
    constructor(aiCallService){
        this.aiCallService = aiCallService;
        this.logger = new _common.Logger(AiCallController.name);
    }
};
_ts_decorate([
    (0, _common.Post)('start'),
    (0, _throttler.Throttle)({
        default: {
            limit: 10,
            ttl: 60000
        }
    }),
    (0, _swagger.ApiOperation)({
        summary: 'Start an AI outbound call',
        description: 'Initiates an outbound Twilio call and starts the AI appointment confirmation agent'
    }),
    (0, _swagger.ApiBody)({
        type: _startcalldto.StartCallDto
    }),
    (0, _swagger.ApiResponse)({
        status: 201,
        description: 'Call initiated successfully',
        schema: {
            example: {
                success: true,
                callId: 'uuid',
                twilioCallSid: 'CAxxxxx',
                status: 'initiated'
            }
        }
    }),
    (0, _swagger.ApiResponse)({
        status: 400,
        description: 'Invalid request'
    }),
    (0, _swagger.ApiResponse)({
        status: 429,
        description: 'Rate limit exceeded'
    }),
    _ts_param(0, (0, _common.Body)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _startcalldto.StartCallDto === "undefined" ? Object : _startcalldto.StartCallDto
    ]),
    _ts_metadata("design:returntype", Promise)
], AiCallController.prototype, "startCall", null);
_ts_decorate([
    (0, _common.Get)(':id'),
    (0, _swagger.ApiOperation)({
        summary: 'Get AI call record'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Call record'
    }),
    (0, _swagger.ApiResponse)({
        status: 404,
        description: 'Call not found'
    }),
    _ts_param(0, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AiCallController.prototype, "getCall", null);
_ts_decorate([
    (0, _common.Get)(':id/transcript'),
    (0, _swagger.ApiOperation)({
        summary: 'Get call transcript'
    }),
    _ts_param(0, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AiCallController.prototype, "getTranscript", null);
_ts_decorate([
    (0, _throttler.SkipThrottle)(),
    (0, _common.Post)('twilio/poll'),
    (0, _common.HttpCode)(200),
    (0, _swagger.ApiOperation)({
        summary: 'Twilio poll endpoint — called repeatedly until AI response is ready'
    }),
    _ts_param(0, (0, _common.Query)('callId')),
    _ts_param(1, (0, _common.Res)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        typeof _express.Response === "undefined" ? Object : _express.Response
    ]),
    _ts_metadata("design:returntype", Promise)
], AiCallController.prototype, "handlePollWebhook", null);
_ts_decorate([
    (0, _throttler.SkipThrottle)(),
    (0, _common.Post)('twilio/voice'),
    (0, _common.HttpCode)(200),
    (0, _swagger.ApiOperation)({
        summary: 'Twilio voice webhook - handles incoming speech from patient'
    }),
    _ts_param(0, (0, _common.Query)('callId')),
    _ts_param(1, (0, _common.Body)()),
    _ts_param(2, (0, _common.Res)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        typeof _twiliovoicedto.TwilioVoiceDto === "undefined" ? Object : _twiliovoicedto.TwilioVoiceDto,
        typeof _express.Response === "undefined" ? Object : _express.Response
    ]),
    _ts_metadata("design:returntype", Promise)
], AiCallController.prototype, "handleVoiceWebhook", null);
_ts_decorate([
    (0, _throttler.SkipThrottle)(),
    (0, _common.Post)('twilio/status'),
    (0, _common.HttpCode)(200),
    (0, _swagger.ApiOperation)({
        summary: 'Twilio status callback'
    }),
    _ts_param(0, (0, _common.Body)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _twiliostatusdto.TwilioStatusDto === "undefined" ? Object : _twiliostatusdto.TwilioStatusDto
    ]),
    _ts_metadata("design:returntype", Promise)
], AiCallController.prototype, "handleStatusCallback", null);
_ts_decorate([
    (0, _throttler.SkipThrottle)(),
    (0, _common.Post)('twilio/recording'),
    (0, _common.HttpCode)(200),
    (0, _swagger.ApiOperation)({
        summary: 'Twilio recording callback'
    }),
    _ts_param(0, (0, _common.Body)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object
    ]),
    _ts_metadata("design:returntype", void 0)
], AiCallController.prototype, "handleRecordingCallback", null);
AiCallController = _ts_decorate([
    (0, _swagger.ApiTags)('AI Call'),
    (0, _common.Controller)('ai-call'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _aicallservice.AiCallService === "undefined" ? Object : _aicallservice.AiCallService
    ])
], AiCallController);

//# sourceMappingURL=ai-call.controller.js.map