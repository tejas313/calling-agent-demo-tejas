"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createConfirmAppointmentTool", {
    enumerable: true,
    get: function() {
        return createConfirmAppointmentTool;
    }
});
const _tools = require("@langchain/core/tools");
const _zod = require("zod");
function createConfirmAppointmentTool(appointmentsService) {
    return new _tools.DynamicStructuredTool({
        name: 'confirmAppointment',
        description: 'Confirm a patient appointment. Call this only after the patient explicitly agrees to confirm their appointment.',
        schema: _zod.z.object({
            appointmentId: _zod.z.string().describe('The appointment ID to confirm')
        }),
        func: async ({ appointmentId })=>{
            try {
                await appointmentsService.confirm(appointmentId);
                return JSON.stringify({
                    success: true,
                    appointmentId,
                    status: 'CONFIRMED',
                    message: 'Appointment successfully confirmed.'
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to confirm appointment'
                });
            }
        }
    });
}

//# sourceMappingURL=confirm-appointment.tool.js.map