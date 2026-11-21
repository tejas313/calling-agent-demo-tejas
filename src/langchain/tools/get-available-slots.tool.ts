import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';

export function createGetAvailableSlotsTool(
  appointmentsService: AppointmentsService,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'getAvailableSlots',
    description:
      'Get available appointment time slots for a physician on a specific date. Use this when the patient wants to reschedule.',
    schema: z.object({
      physicianId: z.string(),
      date: z.string().describe('Date in YYYY-MM-DD format'),
    }),
    func: async ({ physicianId, date }: { physicianId: string; date: string }) => {
      try {
        const slots = await appointmentsService.getAvailableSlots(physicianId, date);
        return JSON.stringify({
          availableSlots: slots,
          count: slots.length,
        });
      } catch (error) {
        return JSON.stringify({ error: 'Failed to retrieve available slots' });
      }
    },
  });
}
