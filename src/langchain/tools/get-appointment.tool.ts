import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';

export function createGetAppointmentTool(
  appointmentsService: AppointmentsService,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'getAppointment',
    description:
      'Retrieve appointment details for a specific patient and appointment ID. Only call this after patient identity is verified.',
    schema: z.object({
      patientId: z.string(),
      appointmentId: z.string(),
    }),
    func: async ({ patientId, appointmentId }: { patientId: string; appointmentId: string }) => {
      try {
        const appointment = await appointmentsService.findById(appointmentId);

        if (!appointment || appointment.patientId !== patientId) {
          return JSON.stringify({
            error: 'Appointment not found or does not belong to the specified patient',
          });
        }

        const formattedDate = new Date(appointment.date).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

        return JSON.stringify({
          id: appointment.id,
          date: formattedDate,
          time: appointment.time,
          appointmentType: appointment.appointmentType,
          status: appointment.status,
          clinicId: appointment.clinicId,
          physicianId: appointment.physicianId,
        });
      } catch (error) {
        return JSON.stringify({ error: 'Failed to retrieve appointment details' });
      }
    },
  });
}
