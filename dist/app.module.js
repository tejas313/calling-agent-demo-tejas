"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AppModule", {
    enumerable: true,
    get: function() {
        return AppModule;
    }
});
const _common = require("@nestjs/common");
const _core = require("@nestjs/core");
const _config = require("@nestjs/config");
const _throttler = require("@nestjs/throttler");
const _databasemodule = require("./database/database.module");
const _langsmithmodule = require("./langsmith/langsmith.module");
const _patientsmodule = require("./patients/patients.module");
const _appointmentsmodule = require("./appointments/appointments.module");
const _langchainmodule = require("./langchain/langchain.module");
const _twiliomodule = require("./twilio/twilio.module");
const _aicallmodule = require("./ai-call/ai-call.module");
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
let AppModule = class AppModule {
};
AppModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _config.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env'
            }),
            _throttler.ThrottlerModule.forRoot([
                {
                    name: 'default',
                    ttl: 60000,
                    limit: 10
                }
            ]),
            _databasemodule.DatabaseModule,
            _langsmithmodule.LangsmithModule,
            _patientsmodule.PatientsModule,
            _appointmentsmodule.AppointmentsModule,
            _langchainmodule.LangchainModule,
            _twiliomodule.TwilioModule,
            _aicallmodule.AiCallModule
        ],
        providers: [
            {
                provide: _core.APP_GUARD,
                useClass: _throttler.ThrottlerGuard
            }
        ]
    })
], AppModule);

//# sourceMappingURL=app.module.js.map