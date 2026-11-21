import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';

export function createCancelAppointmentTool(
  appointmentsService: AppointmentsService,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'cancelAppointment',
    description:
      'Cancel a patient appointment. Call this only after the patient explicitly requests cancellation.',
    schema: z.object({
      appointmentId: z.string(),
      reason: z.string().optional().describe('Reason for cancellation'),
    }),
    func: async ({ appointmentId, reason }: { appointmentId: string; reason?: string }) => {
      try {
        await appointmentsService.cancel(appointmentId, reason);
        return JSON.stringify({
          success: true,
          appointmentId,
          status: 'CANCELLED',
          message: 'Appointment successfully cancelled.',
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: 'Failed to cancel appointment' });
      }
    },
  });
}
