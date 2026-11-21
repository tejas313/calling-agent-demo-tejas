import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';

export function createMarkCallLaterTool(
  appointmentsService: AppointmentsService,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'markCallLater',
    description:
      'Record that the patient requests a callback at a later time. Use this when the patient says they cannot speak now or wants to be called back.',
    schema: z.object({
      appointmentId: z.string(),
      callbackTime: z.string().describe('Preferred callback time as described by patient'),
    }),
    func: async ({
      appointmentId,
      callbackTime,
    }: {
      appointmentId: string;
      callbackTime: string;
    }) => {
      try {
        await appointmentsService.markCallLater(appointmentId, callbackTime);
        return JSON.stringify({
          success: true,
          appointmentId,
          callbackTime,
          message: 'Callback request successfully recorded.',
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: 'Failed to mark callback time' });
      }
    },
  });
}
