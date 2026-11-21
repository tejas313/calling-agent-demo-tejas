import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';

export function createRescheduleAppointmentTool(
  appointmentsService: AppointmentsService,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'rescheduleAppointment',
    description:
      'Reschedule a patient appointment to a new date and time. Only call this after confirming the new time with the patient.',
    schema: z.object({
      appointmentId: z.string(),
      newDate: z.string().describe('New date in YYYY-MM-DD format'),
      newTime: z.string().describe('New time in HH:MM format'),
    }),
    func: async ({
      appointmentId,
      newDate,
      newTime,
    }: {
      appointmentId: string;
      newDate: string;
      newTime: string;
    }) => {
      try {
        await appointmentsService.reschedule(appointmentId, newDate, newTime);
        return JSON.stringify({
          success: true,
          appointmentId,
          newDate,
          newTime,
          status: 'RESCHEDULED',
          message: 'Appointment successfully rescheduled.',
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: 'Failed to reschedule appointment' });
      }
    },
  });
}
