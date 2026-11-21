"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createGetAppointmentTool", {
    enumerable: true,
    get: function() {
        return createGetAppointmentTool;
    }
});
const _tools = require("@langchain/core/tools");
const _zod = require("zod");
function createGetAppointmentTool(appointmentsService) {
    return new _tools.DynamicStructuredTool({
        name: 'getAppointment',
        description: 'Retrieve appointment details for a specific patient and appointment ID. Only call this after patient identity is verified.',
        schema: _zod.z.object({
            patientId: _zod.z.string(),
            appointmentId: _zod.z.string()
        }),
        func: async ({ patientId, appointmentId })=>{
            try {
                const appointment = await appointmentsService.findById(appointmentId);
                if (!appointment || appointment.patientId !== patientId) {
                    return JSON.stringify({
                        error: 'Appointment not found or does not belong to the specified patient'
                    });
                }
                const formattedDate = new Date(appointment.date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                });
                return JSON.stringify({
                    id: appointment.id,
                    date: formattedDate,
                    time: appointment.time,
                    appointmentType: appointment.appointmentType,
                    status: appointment.status,
                    clinicId: appointment.clinicId,
                    physicianId: appointment.physicianId
                });
            } catch (error) {
                return JSON.stringify({
                    error: 'Failed to retrieve appointment details'
                });
            }
        }
    });
}

//# sourceMappingURL=get-appointment.tool.js.map