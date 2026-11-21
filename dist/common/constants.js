// This file is the canonical constants file.
// All source files import from here (e.g. '../common/constants' or '../../common/constants').
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get AppointmentStatus () {
        return AppointmentStatus;
    },
    get CallOutcome () {
        return CallOutcome;
    },
    get CallStatus () {
        return CallStatus;
    },
    get CallType () {
        return CallType;
    },
    get DEFAULT_LANGUAGE () {
        return DEFAULT_LANGUAGE;
    },
    get Intent () {
        return Intent;
    },
    get Language () {
        return Language;
    },
    get MAX_CALL_TURNS () {
        return MAX_CALL_TURNS;
    },
    get SUPPORTED_LANGUAGES () {
        return SUPPORTED_LANGUAGES;
    },
    get VOICE_LANGUAGE_MAP () {
        return VOICE_LANGUAGE_MAP;
    }
});
var AppointmentStatus = /*#__PURE__*/ function(AppointmentStatus) {
    AppointmentStatus["PENDING"] = "PENDING";
    AppointmentStatus["CONFIRMED"] = "CONFIRMED";
    AppointmentStatus["CANCELLED"] = "CANCELLED";
    AppointmentStatus["RESCHEDULED"] = "RESCHEDULED";
    AppointmentStatus["NO_SHOW"] = "NO_SHOW";
    return AppointmentStatus;
}({});
var CallStatus = /*#__PURE__*/ function(CallStatus) {
    CallStatus["INITIATED"] = "INITIATED";
    CallStatus["RINGING"] = "RINGING";
    CallStatus["ANSWERED"] = "ANSWERED";
    CallStatus["IN_PROGRESS"] = "IN_PROGRESS";
    CallStatus["COMPLETED"] = "COMPLETED";
    CallStatus["FAILED"] = "FAILED";
    CallStatus["NO_ANSWER"] = "NO_ANSWER";
    return CallStatus;
}({});
var CallOutcome = /*#__PURE__*/ function(CallOutcome) {
    CallOutcome["CONFIRMED"] = "CONFIRMED";
    CallOutcome["CANCELLED"] = "CANCELLED";
    CallOutcome["RESCHEDULED"] = "RESCHEDULED";
    CallOutcome["CALL_LATER"] = "CALL_LATER";
    CallOutcome["FAILED"] = "FAILED";
    CallOutcome["UNKNOWN"] = "UNKNOWN";
    return CallOutcome;
}({});
var CallType = /*#__PURE__*/ function(CallType) {
    CallType["APPOINTMENT_CONFIRMATION"] = "appointment_confirmation";
    return CallType;
}({});
var Intent = /*#__PURE__*/ function(Intent) {
    Intent["CONFIRM_APPOINTMENT"] = "CONFIRM_APPOINTMENT";
    Intent["CANCEL_APPOINTMENT"] = "CANCEL_APPOINTMENT";
    Intent["RESCHEDULE_APPOINTMENT"] = "RESCHEDULE_APPOINTMENT";
    Intent["CALL_LATER"] = "CALL_LATER";
    Intent["UNKNOWN"] = "UNKNOWN";
    return Intent;
}({});
var Language = /*#__PURE__*/ function(Language) {
    Language["EN"] = "en";
    Language["FR"] = "fr";
    return Language;
}({});
const SUPPORTED_LANGUAGES = [
    'en',
    'fr'
];
const DEFAULT_LANGUAGE = 'en';
const MAX_CALL_TURNS = 10;
const VOICE_LANGUAGE_MAP = {
    en: 'en-US',
    fr: 'fr-FR'
};

//# sourceMappingURL=constants.js.map