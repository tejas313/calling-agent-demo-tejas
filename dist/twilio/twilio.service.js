"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "TwilioService", {
    enumerable: true,
    get: function() {
        return TwilioService;
    }
});
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _twilio = /*#__PURE__*/ _interop_require_wildcard(require("twilio"));
function _getRequireWildcardCache(nodeInterop) {
    if (typeof WeakMap !== "function") return null;
    var cacheBabelInterop = new WeakMap();
    var cacheNodeInterop = new WeakMap();
    return (_getRequireWildcardCache = function(nodeInterop) {
        return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
    })(nodeInterop);
}
function _interop_require_wildcard(obj, nodeInterop) {
    if (!nodeInterop && obj && obj.__esModule) return obj;
    if (obj === null || typeof obj !== "object" && typeof obj !== "function") return {
        default: obj
    };
    var cache = _getRequireWildcardCache(nodeInterop);
    if (cache && cache.has(obj)) return cache.get(obj);
    var newObj = {
        __proto__: null
    };
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for(var key in obj){
        if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
            if (desc && (desc.get || desc.set)) Object.defineProperty(newObj, key, desc);
            else newObj[key] = obj[key];
        }
    }
    newObj.default = obj;
    if (cache) cache.set(obj, newObj);
    return newObj;
}
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
let TwilioService = class TwilioService {
    async createOutboundCall(to, webhookBaseUrl, aiCallId) {
        try {
            this.logger.log(`Creating outbound call to [REDACTED] for callId=${aiCallId}`);
            const call = await this.client.calls.create({
                to,
                from: this.configService.get("TWILIO_PHONE_NUMBER"),
                url: `${webhookBaseUrl}/ai-call/twilio/voice?callId=${aiCallId}`,
                statusCallback: `${webhookBaseUrl}/ai-call/twilio/status`,
                statusCallbackMethod: "POST",
                statusCallbackEvent: [
                    "initiated",
                    "ringing",
                    "answered",
                    "completed"
                ]
            });
            this.logger.log(`Outbound call created: SID=${call.sid}`);
            return {
                callSid: call.sid
            };
        } catch (error) {
            this.logger.error("Failed to create outbound Twilio call", error?.message);
            throw error;
        }
    }
    validateWebhookSignature(authToken, signature, url, params) {
        try {
            return _twilio.validateRequest(authToken, signature, url, params);
        } catch (error) {
            this.logger.error("Error validating Twilio webhook signature", error);
            return false;
        }
    }
    generateTwiML(text, language) {
        const lang = language === 'fr' ? 'fr-FR' : 'en-US';
        const escaped = this.escapeXml(text);
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="${lang}">${escaped}</Say>
  <Hangup/>
</Response>`;
    }
    generateGatherTwiML(text, actionUrl, language) {
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
    generateHangupTwiML(text, language) {
        return this.generateTwiML(text, language);
    }
    escapeXml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    }
    constructor(configService){
        this.configService = configService;
        this.logger = new _common.Logger(TwilioService.name);
        const accountSid = this.configService.get("TWILIO_ACCOUNT_SID");
        const authToken = this.configService.get("TWILIO_AUTH_TOKEN");
        this.client = _twilio.default(accountSid, authToken);
    }
};
TwilioService = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService
    ])
], TwilioService);

//# sourceMappingURL=twilio.service.js.map