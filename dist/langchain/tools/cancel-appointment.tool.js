"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createCancelAppointmentTool", {
    enumerable: true,
    get: function() {
        return createCancelAppointmentTool;
    }
});
const _tools = require("@langchain/core/tools");
const _zod = require("zod");
function createCancelAppointmentTool(appointmentsService) {
    return new _tools.DynamicStructuredTool({
        name: 'cancelAppointment',
        description: 'Cancel a patient appointment. Call this only after the patient explicitly requests cancellation.',
        schema: _zod.z.object({
            appointmentId: _zod.z.string(),
            reason: _zod.z.string().optional().describe('Reason for cancellation')
        }),
        func: async ({ appointmentId, reason })=>{
            try {
                await appointmentsService.cancel(appointmentId, reason);
                return JSON.stringify({
                    success: true,
                    appointmentId,
                    status: 'CANCELLED',
                    message: 'Appointment successfully cancelled.'
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to cancel appointment'
                });
            }
        }
    });
}

//# sourceMappingURL=cancel-appointment.tool.js.map