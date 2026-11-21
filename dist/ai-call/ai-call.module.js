"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AiCallModule", {
    enumerable: true,
    get: function() {
        return AiCallModule;
    }
});
const _common = require("@nestjs/common");
const _typeorm = require("@nestjs/typeorm");
const _aicallentity = require("./entities/ai-call.entity");
const _aicallcontroller = require("./ai-call.controller");
const _aicallservice = require("./ai-call.service");
const _twiliomodule = require("../twilio/twilio.module");
const _langchainmodule = require("../langchain/langchain.module");
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
let AiCallModule = class AiCallModule {
};
AiCallModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _typeorm.TypeOrmModule.forFeature([
                _aicallentity.AiCall
            ]),
            _twiliomodule.TwilioModule,
            _langchainmodule.LangchainModule
        ],
        controllers: [
            _aicallcontroller.AiCallController
        ],
        providers: [
            _aicallservice.AiCallService
        ],
        exports: [
            _aicallservice.AiCallService
        ]
    })
], AiCallModule);

//# sourceMappingURL=ai-call.module.js.map