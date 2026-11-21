"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "LangchainModule", {
    enumerable: true,
    get: function() {
        return LangchainModule;
    }
});
const _common = require("@nestjs/common");
const _agentservice = require("./agent/agent.service");
const _patientsmodule = require("../patients/patients.module");
const _appointmentsmodule = require("../appointments/appointments.module");
const _langsmithmodule = require("../langsmith/langsmith.module");
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
let LangchainModule = class LangchainModule {
};
LangchainModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _patientsmodule.PatientsModule,
            _appointmentsmodule.AppointmentsModule,
            _langsmithmodule.LangsmithModule
        ],
        providers: [
            _agentservice.AgentService
        ],
        exports: [
            _agentservice.AgentService
        ]
    })
], LangchainModule);

//# sourceMappingURL=langchain.module.js.map