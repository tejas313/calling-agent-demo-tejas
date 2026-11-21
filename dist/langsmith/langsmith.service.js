"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "LangsmithService", {
    enumerable: true,
    get: function() {
        return LangsmithService;
    }
});
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
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
let LangsmithService = class LangsmithService {
    getMetadata(params) {
        return {
            clinicId: params.clinicId,
            patientId: params.patientId,
            appointmentId: params.appointmentId,
            callId: params.callId,
            twilioCallSid: params.twilioCallSid || '',
            language: params.language,
            callType: params.callType
        };
    }
    getTags(params) {
        return [
            'ai-call',
            params.callType.toLowerCase().replace(/_/g, '-'),
            `clinic-${params.clinicId}`,
            `lang-${params.language.toLowerCase()}`
        ];
    }
    isTracingEnabled() {
        return process.env.LANGCHAIN_TRACING_V2 === 'true';
    }
    constructor(configService){
        this.configService = configService;
        process.env.LANGCHAIN_TRACING_V2 = configService.get('LANGSMITH_TRACING', 'true');
        process.env.LANGCHAIN_API_KEY = configService.get('LANGSMITH_API_KEY', '');
        process.env.LANGCHAIN_PROJECT = configService.get('LANGSMITH_PROJECT', 'medi-schedule-ai-call-agent');
        process.env.LANGCHAIN_ENDPOINT = configService.get('LANGSMITH_ENDPOINT', 'https://api.smith.langchain.com');
    }
};
LangsmithService = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService
    ])
], LangsmithService);

//# sourceMappingURL=langsmith.service.js.map