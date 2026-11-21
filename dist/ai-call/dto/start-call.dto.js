"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "StartCallDto", {
    enumerable: true,
    get: function() {
        return StartCallDto;
    }
});
const _classvalidator = require("class-validator");
const _swagger = require("@nestjs/swagger");
const _constants = require("../../common/constants");
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
let StartCallDto = class StartCallDto {
    constructor(){
        this.language = 'en';
        this.callType = _constants.CallType.APPOINTMENT_CONFIRMATION;
    }
};
_ts_decorate([
    (0, _swagger.ApiProperty)({
        example: '+14165551234',
        description: 'Patient phone number in E.164 format'
    }),
    (0, _classvalidator.IsString)(),
    (0, _classvalidator.IsNotEmpty)(),
    _ts_metadata("design:type", String)
], StartCallDto.prototype, "phoneNumber", void 0);
_ts_decorate([
    (0, _swagger.ApiProperty)({
        example: 'PAT-001',
        description: 'Patient ID'
    }),
    (0, _classvalidator.IsString)(),
    (0, _classvalidator.IsNotEmpty)(),
    _ts_metadata("design:type", String)
], StartCallDto.prototype, "patientId", void 0);
_ts_decorate([
    (0, _swagger.ApiProperty)({
        example: 'CLINIC-001',
        description: 'Clinic ID'
    }),
    (0, _classvalidator.IsString)(),
    (0, _classvalidator.IsNotEmpty)(),
    _ts_metadata("design:type", String)
], StartCallDto.prototype, "clinicId", void 0);
_ts_decorate([
    (0, _swagger.ApiProperty)({
        example: 'APT-001',
        description: 'Appointment ID'
    }),
    (0, _classvalidator.IsString)(),
    (0, _classvalidator.IsNotEmpty)(),
    _ts_metadata("design:type", String)
], StartCallDto.prototype, "appointmentId", void 0);
_ts_decorate([
    (0, _swagger.ApiPropertyOptional)({
        example: 'en',
        description: 'Language code',
        enum: [
            'en',
            'fr'
        ]
    }),
    (0, _classvalidator.IsOptional)(),
    (0, _classvalidator.IsString)(),
    _ts_metadata("design:type", String)
], StartCallDto.prototype, "language", void 0);
_ts_decorate([
    (0, _swagger.ApiPropertyOptional)({
        example: 'appointment_confirmation',
        enum: _constants.CallType
    }),
    (0, _classvalidator.IsOptional)(),
    (0, _classvalidator.IsEnum)(_constants.CallType),
    _ts_metadata("design:type", typeof _constants.CallType === "undefined" ? Object : _constants.CallType)
], StartCallDto.prototype, "callType", void 0);
_ts_decorate([
    (0, _swagger.ApiPropertyOptional)({
        example: false,
        description: 'Test mode: skips the real Twilio call. Use when Twilio number is not yet verified. The AI webhook can still be triggered manually via POST /ai-call/twilio/voice?callId=<id>'
    }),
    (0, _classvalidator.IsOptional)(),
    (0, _classvalidator.IsBoolean)(),
    _ts_metadata("design:type", Boolean)
], StartCallDto.prototype, "testMode", void 0);

//# sourceMappingURL=start-call.dto.js.map