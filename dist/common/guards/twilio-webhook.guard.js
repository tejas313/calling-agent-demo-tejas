"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "TwilioWebhookGuard", {
    enumerable: true,
    get: function() {
        return TwilioWebhookGuard;
    }
});
const _common = require("@nestjs/common");
const _core = require("@nestjs/core");
const _config = require("@nestjs/config");
const _twilio = /*#__PURE__*/ _interop_require_wildcard(require("twilio"));
function _getRequireWildcardCache(nodeInterop) {
    if (typeof WeakMap !== "function") return null;
    var cacheBabelInterop = new WeakMap();
    var cacheNodeInterop = new WeakMap();
    return (_getRequireWildcardCache = function(nodeInterop) {
        return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
    })(nodeInterop);
}
function _interop_require_wildcard(obj, nodeInterop) {
    if (!nodeInterop && obj && obj.__esModule) return obj;
    if (obj === null || typeof obj !== "object" && typeof obj !== "function") return {
        default: obj
    };
    var cache = _getRequireWildcardCache(nodeInterop);
    if (cache && cache.has(obj)) return cache.get(obj);
    var newObj = {
        __proto__: null
    };
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for(var key in obj){
        if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
            if (desc && (desc.get || desc.set)) Object.defineProperty(newObj, key, desc);
            else newObj[key] = obj[key];
        }
    }
    newObj.default = obj;
    if (cache) cache.set(obj, newObj);
    return newObj;
}
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
let TwilioWebhookGuard = class TwilioWebhookGuard {
    canActivate(context) {
        const skip = this.reflector.get('skipTwilioValidation', context.getHandler());
        if (skip) {
            return true;
        }
        const req = context.switchToHttp().getRequest();
        const authToken = this.configService.get('TWILIO_AUTH_TOKEN', '');
        const signature = req.headers['x-twilio-signature'];
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const params = req.body;
        if (!signature) {
            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn('No Twilio signature provided, bypassing in dev mode');
                return true;
            }
            throw new _common.ForbiddenException('Missing Twilio signature');
        }
        const isValid = _twilio.validateRequest(authToken, signature, url, params);
        if (!isValid) {
            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn('Twilio webhook validation failed, but bypassing for dev mode');
                return true;
            }
            throw new _common.ForbiddenException('Invalid Twilio signature');
        }
        return true;
    }
    constructor(reflector, configService){
        this.reflector = reflector;
        this.configService = configService;
        this.logger = new _common.Logger(TwilioWebhookGuard.name);
    }
};
TwilioWebhookGuard = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _core.Reflector === "undefined" ? Object : _core.Reflector,
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService
    ])
], TwilioWebhookGuard);

//# sourceMappingURL=twilio-webhook.guard.js.map