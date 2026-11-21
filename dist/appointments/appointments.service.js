"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AppointmentsService", {
    enumerable: true,
    get: function() {
        return AppointmentsService;
    }
});
const _common = require("@nestjs/common");
const _typeorm = require("@nestjs/typeorm");
const _typeorm1 = require("typeorm");
const _appointmententity = require("./entities/appointment.entity");
const _constants = require("../common/constants");
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
let AppointmentsService = class AppointmentsService {
    async findAll() {
        return this.appointmentRepository.find();
    }
    async findById(id) {
        const appointment = await this.appointmentRepository.findOne({
            where: {
                id
            }
        });
        if (!appointment) {
            throw new _common.NotFoundException(`Appointment with ID ${id} not found`);
        }
        return appointment;
    }
    async findByPatient(patientId) {
        return this.appointmentRepository.find({
            where: {
                patientId
            }
        });
    }
    async confirm(appointmentId) {
        const appointment = await this.findById(appointmentId);
        if (appointment.status === _constants.AppointmentStatus.CONFIRMED) {
            this.logger.log(`Appointment ${appointmentId} is already confirmed.`);
            return appointment;
        }
        if (appointment.status === _constants.AppointmentStatus.CANCELLED) {
            throw new _common.BadRequestException('Cannot confirm a cancelled appointment');
        }
        appointment.status = _constants.AppointmentStatus.CONFIRMED;
        return this.appointmentRepository.save(appointment);
    }
    async cancel(appointmentId, reason) {
        const appointment = await this.findById(appointmentId);
        if (appointment.status === _constants.AppointmentStatus.CANCELLED) {
            return appointment;
        }
        appointment.status = _constants.AppointmentStatus.CANCELLED;
        if (reason) {
            appointment.cancelReason = reason;
        }
        return this.appointmentRepository.save(appointment);
    }
    async reschedule(appointmentId, newDate, newTime) {
        const appointment = await this.findById(appointmentId);
        if (appointment.status === _constants.AppointmentStatus.CANCELLED) {
            throw new _common.BadRequestException('Cannot reschedule a cancelled appointment');
        }
        appointment.date = new Date(newDate);
        appointment.time = newTime;
        appointment.status = _constants.AppointmentStatus.RESCHEDULED;
        return this.appointmentRepository.save(appointment);
    }
    async getAvailableSlots(physicianId, date) {
        const allSlots = [
            '08:00',
            '08:30',
            '09:00',
            '09:30',
            '10:00',
            '10:30',
            '11:00',
            '11:30',
            '14:00',
            '14:30',
            '15:00',
            '15:30',
            '16:00',
            '16:30'
        ];
        const existingAppointments = await this.appointmentRepository.find({
            where: {
                physicianId,
                date: new Date(date)
            }
        });
        const takenSlots = existingAppointments.map((a)=>a.time);
        let availableSlots = allSlots.filter((slot)=>!takenSlots.includes(slot));
        // For demo purposes: ensure minimum 3 slots
        if (availableSlots.length < 3) {
            availableSlots = allSlots.slice(0, 3);
        }
        return availableSlots;
    }
    async markCallLater(appointmentId, callbackTime) {
        const appointment = await this.findById(appointmentId);
        appointment.callbackTime = callbackTime;
        return this.appointmentRepository.save(appointment);
    }
    constructor(appointmentRepository){
        this.appointmentRepository = appointmentRepository;
        this.logger = new _common.Logger(AppointmentsService.name);
    }
};
AppointmentsService = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_param(0, (0, _typeorm.InjectRepository)(_appointmententity.Appointment)),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _typeorm1.Repository === "undefined" ? Object : _typeorm1.Repository
    ])
], AppointmentsService);

//# sourceMappingURL=appointments.service.js.map