"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "Patient", {
    enumerable: true,
    get: function() {
        return Patient;
    }
});
const _typeorm = require("typeorm");
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
let Patient = class Patient {
};
_ts_decorate([
    (0, _typeorm.PrimaryColumn)(),
    _ts_metadata("design:type", String)
], Patient.prototype, "id", void 0);
_ts_decorate([
    (0, _typeorm.Column)(),
    _ts_metadata("design:type", String)
], Patient.prototype, "name", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        unique: true
    }),
    _ts_metadata("design:type", String)
], Patient.prototype, "phone", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'date_of_birth',
        type: 'date'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], Patient.prototype, "dateOfBirth", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        default: 'en'
    }),
    _ts_metadata("design:type", String)
], Patient.prototype, "language", void 0);
_ts_decorate([
    (0, _typeorm.Column)({
        name: 'clinic_id',
        nullable: true
    }),
    _ts_metadata("design:type", String)
], Patient.prototype, "clinicId", void 0);
_ts_decorate([
    (0, _typeorm.CreateDateColumn)({
        name: 'created_at'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], Patient.prototype, "createdAt", void 0);
_ts_decorate([
    (0, _typeorm.UpdateDateColumn)({
        name: 'updated_at'
    }),
    _ts_metadata("design:type", typeof Date === "undefined" ? Object : Date)
], Patient.prototype, "updatedAt", void 0);
Patient = _ts_decorate([
    (0, _typeorm.Entity)('patients')
], Patient);

//# sourceMappingURL=patient.entity.js.map