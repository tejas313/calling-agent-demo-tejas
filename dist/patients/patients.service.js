"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "PatientsService", {
    enumerable: true,
    get: function() {
        return PatientsService;
    }
});
const _common = require("@nestjs/common");
const _typeorm = require("@nestjs/typeorm");
const _typeorm1 = require("typeorm");
const _patiententity = require("./entities/patient.entity");
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
let PatientsService = class PatientsService {
    async findAll() {
        return this.patientRepository.find();
    }
    async findById(id) {
        const patient = await this.patientRepository.findOne({
            where: {
                id
            }
        });
        if (!patient) {
            throw new _common.NotFoundException(`Patient with ID ${id} not found`);
        }
        return patient;
    }
    async findByPhone(phone) {
        const normalizedPhone = phone.replace(/\D/g, '');
        const patients = await this.patientRepository.find();
        return patients.find((p)=>(p.phone || '').replace(/\D/g, '') === normalizedPhone) || null;
    }
    async verifyPatient(phoneNumber, patientId) {
        this.logger.log(`Attempting verification for patient ID: ${patientId} (phone number omitted)`);
        try {
            const patient = await this.findById(patientId);
            const normalizedInput = phoneNumber.replace(/\D/g, '');
            const normalizedStored = (patient.phone || '').replace(/\D/g, '');
            if (normalizedInput === normalizedStored) {
                return {
                    verified: true,
                    patientId: patient.id,
                    patientName: patient.name
                };
            }
            return {
                verified: false,
                reason: 'Phone number does not match our records'
            };
        } catch (error) {
            if (error instanceof _common.NotFoundException) {
                return {
                    verified: false,
                    reason: 'Patient not found'
                };
            }
            throw error;
        }
    }
    constructor(patientRepository){
        this.patientRepository = patientRepository;
        this.logger = new _common.Logger(PatientsService.name);
    }
};
PatientsService = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_param(0, (0, _typeorm.InjectRepository)(_patiententity.Patient)),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _typeorm1.Repository === "undefined" ? Object : _typeorm1.Repository
    ])
], PatientsService);

//# sourceMappingURL=patients.service.js.map