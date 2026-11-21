import { createGetAvailableSlotsTool } from '../../../src/langchain/tools/get-available-slots.tool';
import { AppointmentsService } from '../../../src/appointments/appointments.service';

describe('GetAvailableSlotsTool', () => {
  let tool: any;
  let mockAppointmentsService: Partial<jest.Mocked<AppointmentsService>>;

  beforeEach(() => {
    mockAppointmentsService = {
      getAvailableSlots: jest.fn(),
    };
    tool = createGetAvailableSlotsTool(mockAppointmentsService as unknown as AppointmentsService);
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('getAvailableSlots');
  });

  it('should return available slots JSON when slots are available', async () => {
    const slots = ['09:00', '10:00', '14:00'];
    (mockAppointmentsService.getAvailableSlots as jest.Mock).mockResolvedValue(slots);

    const result = await tool.func({ physicianId: 'PHY-001', date: '2026-10-20' });
    const parsed = JSON.parse(result);

    expect(parsed.availableSlots).toEqual(slots);
    expect(parsed.count).toBe(3);
  });

  it('should handle empty slots array', async () => {
    (mockAppointmentsService.getAvailableSlots as jest.Mock).mockResolvedValue([]);

    const result = await tool.func({ physicianId: 'PHY-001', date: '2026-10-20' });
    const parsed = JSON.parse(result);

    expect(parsed.availableSlots).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('should return error JSON on service error', async () => {
    (mockAppointmentsService.getAvailableSlots as jest.Mock).mockRejectedValue(
      new Error('DB Error'),
    );

    const result = await tool.func({ physicianId: 'PHY-001', date: '2026-10-20' });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('error');
  });
});
