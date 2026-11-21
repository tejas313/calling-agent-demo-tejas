"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AppointmentsController", {
    enumerable: true,
    get: function() {
        return AppointmentsController;
    }
});
const _common = require("@nestjs/common");
const _swagger = require("@nestjs/swagger");
const _appointmentsservice = require("./appointments.service");
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
let AppointmentsController = class AppointmentsController {
    async findAll() {
        return this.appointmentsService.findAll();
    }
    async findById(id) {
        return this.appointmentsService.findById(id);
    }
    async findByPatient(patientId) {
        return this.appointmentsService.findByPatient(patientId);
    }
    async confirm(id) {
        return this.appointmentsService.confirm(id);
    }
    async cancel(id, body) {
        return this.appointmentsService.cancel(id, body.reason);
    }
    async getAvailableSlots(id, physicianId, date) {
        return this.appointmentsService.getAvailableSlots(physicianId, date);
    }
    constructor(appointmentsService){
        this.appointmentsService = appointmentsService;
    }
};
_ts_decorate([
    (0, _common.Get)(),
    (0, _swagger.ApiOperation)({
        summary: 'Get all appointments'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Return all appointments.'
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], AppointmentsController.prototype, "findAll", null);
_ts_decorate([
    (0, _common.Get)(':id'),
    (0, _swagger.ApiOperation)({
        summary: 'Get appointment by ID'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Return the appointment.'
    }),
    (0, _swagger.ApiResponse)({
        status: 404,
        description: 'Appointment not found.'
    }),
    _ts_param(0, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AppointmentsController.prototype, "findById", null);
_ts_decorate([
    (0, _common.Get)('patient/:patientId'),
    (0, _swagger.ApiOperation)({
        summary: 'Get appointments for a patient'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Return appointments for the specified patient.'
    }),
    _ts_param(0, (0, _common.Param)('patientId')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AppointmentsController.prototype, "findByPatient", null);
_ts_decorate([
    (0, _common.Patch)(':id/confirm'),
    (0, _swagger.ApiOperation)({
        summary: 'Confirm an appointment'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Appointment confirmed.'
    }),
    _ts_param(0, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AppointmentsController.prototype, "confirm", null);
_ts_decorate([
    (0, _common.Patch)(':id/cancel'),
    (0, _swagger.ApiOperation)({
        summary: 'Cancel an appointment'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Appointment cancelled.'
    }),
    _ts_param(0, (0, _common.Param)('id')),
    _ts_param(1, (0, _common.Body)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        Object
    ]),
    _ts_metadata("design:returntype", Promise)
], AppointmentsController.prototype, "cancel", null);
_ts_decorate([
    (0, _common.Get)(':id/available-slots'),
    (0, _swagger.ApiOperation)({
        summary: 'Get available slots for a physician on a date'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Return available slots.'
    }),
    _ts_param(0, (0, _common.Param)('id')),
    _ts_param(1, (0, _common.Query)('physicianId')),
    _ts_param(2, (0, _common.Query)('date')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        String,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AppointmentsController.prototype, "getAvailableSlots", null);
AppointmentsController = _ts_decorate([
    (0, _swagger.ApiTags)('Appointments'),
    (0, _common.Controller)('appointments'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _appointmentsservice.AppointmentsService === "undefined" ? Object : _appointmentsservice.AppointmentsService
    ])
], AppointmentsController);

//# sourceMappingURL=appointments.controller.js.map