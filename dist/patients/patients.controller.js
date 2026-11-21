"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "PatientsController", {
    enumerable: true,
    get: function() {
        return PatientsController;
    }
});
const _common = require("@nestjs/common");
const _swagger = require("@nestjs/swagger");
const _patientsservice = require("./patients.service");
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
let PatientsController = class PatientsController {
    async findAll() {
        return this.patientsService.findAll();
    }
    async findById(id) {
        return this.patientsService.findById(id);
    }
    constructor(patientsService){
        this.patientsService = patientsService;
    }
};
_ts_decorate([
    (0, _common.Get)(),
    (0, _swagger.ApiOperation)({
        summary: 'Get all patients'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'List of patients returned successfully.'
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], PatientsController.prototype, "findAll", null);
_ts_decorate([
    (0, _common.Get)(':id'),
    (0, _swagger.ApiOperation)({
        summary: 'Get a patient by ID'
    }),
    (0, _swagger.ApiResponse)({
        status: 200,
        description: 'Patient found.'
    }),
    (0, _swagger.ApiResponse)({
        status: 404,
        description: 'Patient not found.'
    }),
    _ts_param(0, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PatientsController.prototype, "findById", null);
PatientsController = _ts_decorate([
    (0, _swagger.ApiTags)('Patients'),
    (0, _common.Controller)('patients'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _patientsservice.PatientsService === "undefined" ? Object : _patientsservice.PatientsService
    ])
], PatientsController);

//# sourceMappingURL=patients.controller.js.map