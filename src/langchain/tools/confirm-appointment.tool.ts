import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';

export function createConfirmAppointmentTool(
  appointmentsService: AppointmentsService,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'confirmAppointment',
    description:
      'Confirm a patient appointment. Call this only after the patient explicitly agrees to confirm their appointment.',
    schema: z.object({
      appointmentId: z.string().describe('The appointment ID to confirm'),
    }),
    func: async ({ appointmentId }: { appointmentId: string }) => {
      try {
        await appointmentsService.confirm(appointmentId);
        return JSON.stringify({
          success: true,
          appointmentId,
          status: 'CONFIRMED',
          message: 'Appointment successfully confirmed.',
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: 'Failed to confirm appointment' });
      }
    },
  });
}
