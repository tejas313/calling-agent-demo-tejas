"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createRescheduleAppointmentTool", {
    enumerable: true,
    get: function() {
        return createRescheduleAppointmentTool;
    }
});
const _tools = require("@langchain/core/tools");
const _zod = require("zod");
function createRescheduleAppointmentTool(appointmentsService) {
    return new _tools.DynamicStructuredTool({
        name: 'rescheduleAppointment',
        description: 'Reschedule a patient appointment to a new date and time. Only call this after confirming the new time with the patient.',
        schema: _zod.z.object({
            appointmentId: _zod.z.string(),
            newDate: _zod.z.string().describe('New date in YYYY-MM-DD format'),
            newTime: _zod.z.string().describe('New time in HH:MM format')
        }),
        func: async ({ appointmentId, newDate, newTime })=>{
            try {
                await appointmentsService.reschedule(appointmentId, newDate, newTime);
                return JSON.stringify({
                    success: true,
                    appointmentId,
                    newDate,
                    newTime,
                    status: 'RESCHEDULED',
                    message: 'Appointment successfully rescheduled.'
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to reschedule appointment'
                });
            }
        }
    });
}

//# sourceMappingURL=reschedule-appointment.tool.js.map