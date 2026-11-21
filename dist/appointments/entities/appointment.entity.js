"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "Appointment", {
    enumerable: true,
    get: function() {
        return Appointment;
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
let Appointment = class Appointment {
};
_ts_decorate([
    (0, _typeorm.PrimaryColumn)(),
    _ts_metadata("design:type", String)
], Appointment.prototype, "id", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'patient_id'
    }),
    _ts_metadata("design:type", String)
], Appointment.prototype, "patientId", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'clinic_id'
    }),
    _ts_metadata("design:type", String)
], Appointment.prototype, "clinicId", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'physician_id'
    }),
    _ts_metadata("design:type", String)
], Appointment.prototype, "physicianId", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        type: 'date'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], Appointment.prototype, "date", void 0);
_ts_decorate([
    (0, _typeorm.Column)(),
    _ts_metadata("design:type", String)
], Appointment.prototype, "time", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'appointment_type'
    }),
    _ts_metadata("design:type", String)
], Appointment.prototype, "appointmentType", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        type: 'enum',
        enum: _constants.AppointmentStatus,
        default: _constants.AppointmentStatus.PENDING
    }),
    _ts_metadata("design:type", typeof _constants.AppointmentStatus === "undefined" ? Object : _constants.AppointmentStatus)
], Appointment.prototype, "status", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        nullable: true
    }),
    _ts_metadata("design:type", String)
], Appointment.prototype, "notes", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'callback_time',
        nullable: true
    }),
    _ts_metadata("design:type", String)
], Appointment.prototype, "callbackTime", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'cancel_reason',
        nullable: true
    }),
    _ts_metadata("design:type", String)
], Appointment.prototype, "cancelReason", void 0);
_ts_decorate([
    (0, _typeorm.CreateDateColumn)({
        name: 'created_at'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], Appointment.prototype, "createdAt", void 0);
_ts_decorate([
    (0, _typeorm.UpdateDateColumn)({
        name: 'updated_at'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], Appointment.prototype, "updatedAt", void 0);
Appointment = _ts_decorate([
    (0, _typeorm.Entity)('appointments')
], Appointment);

//# sourceMappingURL=appointment.entity.js.map