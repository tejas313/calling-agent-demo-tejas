"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createMarkCallLaterTool", {
    enumerable: true,
    get: function() {
        return createMarkCallLaterTool;
    }
});
const _tools = require("@langchain/core/tools");
const _zod = require("zod");
function createMarkCallLaterTool(appointmentsService) {
    return new _tools.DynamicStructuredTool({
        name: 'markCallLater',
        description: 'Record that the patient requests a callback at a later time. Use this when the patient says they cannot speak now or wants to be called back.',
        schema: _zod.z.object({
            appointmentId: _zod.z.string(),
            callbackTime: _zod.z.string().describe('Preferred callback time as described by patient')
        }),
        func: async ({ appointmentId, callbackTime })=>{
            try {
                await appointmentsService.markCallLater(appointmentId, callbackTime);
                return JSON.stringify({
                    success: true,
                    appointmentId,
                    callbackTime,
                    message: 'Callback request successfully recorded.'
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to mark callback time'
                });
            }
        }
    });
}

//# sourceMappingURL=mark-call-later.tool.js.map