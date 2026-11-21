"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AiCall", {
    enumerable: true,
    get: function() {
        return AiCall;
    }
});
const _typeorm = require("typeorm");
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
let AiCall = class AiCall {
};
_ts_decorate([
    (0, _typeorm.PrimaryGeneratedColumn)('uuid'),
    _ts_metadata("design:type", String)
], AiCall.prototype, "id", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'patient_id'
    }),
    _ts_metadata("design:type", String)
], AiCall.prototype, "patientId", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'appointment_id'
    }),
    _ts_metadata("design:type", String)
], AiCall.prototype, "appointmentId", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'clinic_id'
    }),
    _ts_metadata("design:type", String)
], AiCall.prototype, "clinicId", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'phone_number'
    }),
    _ts_metadata("design:type", String)
], AiCall.prototype, "phoneNumber", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'twilio_call_sid',
        nullable: true
    }),
    _ts_metadata("design:type", String)
], AiCall.prototype, "twilioCallSid", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        default: 'en'
    }),
    _ts_metadata("design:type", String)
], AiCall.prototype, "language", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'call_type',
        type: 'enum',
        enum: _constants.CallType,
        default: _constants.CallType.APPOINTMENT_CONFIRMATION
    }),
    _ts_metadata("design:type", typeof _constants.CallType === "undefined" ? Object : _constants.CallType)
], AiCall.prototype, "callType", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        type: 'enum',
        enum: _constants.CallStatus,
        default: _constants.CallStatus.INITIATED
    }),
    _ts_metadata("design:type", typeof _constants.CallStatus === "undefined" ? Object : _constants.CallStatus)
], AiCall.prototype, "status", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        type: 'enum',
        enum: _constants.CallOutcome,
        nullable: true
    }),
    _ts_metadata("design:type", typeof _constants.CallOutcome === "undefined" ? Object : _constants.CallOutcome)
], AiCall.prototype, "outcome", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        type: 'jsonb',
        default: []
    }),
    _ts_metadata("design:type", Array)
], AiCall.prototype, "transcript", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'conversation_history',
        type: 'jsonb',
        default: []
    }),
    _ts_metadata("design:type", Array)
], AiCall.prototype, "conversationHistory", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'current_turn',
        default: 0
    }),
    _ts_metadata("design:type", Number)
], AiCall.prototype, "currentTurn", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'started_at',
        nullable: true
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], AiCall.prototype, "startedAt", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'ended_at',
        nullable: true
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], AiCall.prototype, "endedAt", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        nullable: true
    }),
    _ts_metadata("design:type", Number)
], AiCall.prototype, "duration", void 0);
_ts_decorate([
    (0, _typeorm.CreateDateColumn)({
        name: 'created_at'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], AiCall.prototype, "createdAt", void 0);
_ts_decorate([
    (0, _typeorm.UpdateDateColumn)({
        name: 'updated_at'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], AiCall.prototype, "updatedAt", void 0);
AiCall = _ts_decorate([
    (0, _typeorm.Entity)('ai_calls')
], AiCall);

//# sourceMappingURL=ai-call.entity.js.map