"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "LoggingInterceptor", {
    enumerable: true,
    get: function() {
        return LoggingInterceptor;
    }
});
const _common = require("@nestjs/common");
const _operators = require("rxjs/operators");
const _uuid = require("uuid");
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
let LoggingInterceptor = class LoggingInterceptor {
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const method = req.method;
        const url = req.originalUrl;
        const requestId = req.headers['x-request-id'] || (0, _uuid.v4)();
        const startTime = Date.now();
        return next.handle().pipe((0, _operators.tap)(()=>{
            const responseTimeMs = Date.now() - startTime;
            const statusCode = res.statusCode;
            this.logger.log(`[ReqID: ${requestId}] ${method} ${url} ${statusCode} - ${responseTimeMs}ms`);
        }));
    }
    constructor(){
        this.logger = new _common.Logger(LoggingInterceptor.name);
    }
};
LoggingInterceptor = _ts_decorate([
    (0, _common.Injectable)()
], LoggingInterceptor);

//# sourceMappingURL=logging.interceptor.js.map