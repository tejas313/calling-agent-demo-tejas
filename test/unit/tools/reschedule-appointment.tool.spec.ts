import { createRescheduleAppointmentTool } from '../../../src/langchain/tools/reschedule-appointment.tool';
import { AppointmentsService } from '../../../src/appointments/appointments.service';

const mockRescheduledAppointment = {
  id: 'APT-001',
  patientId: 'PAT-001',
  date: new Date('2026-10-25'),
  time: '14:00',
  status: 'RESCHEDULED',
};

describe('RescheduleAppointmentTool', () => {
  let tool: any;
  let mockAppointmentsService: Partial<jest.Mocked<AppointmentsService>>;

  beforeEach(() => {
    mockAppointmentsService = {
      reschedule: jest.fn(),
    };
    tool = createRescheduleAppointmentTool(
      mockAppointmentsService as unknown as AppointmentsService,
    );
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('rescheduleAppointment');
  });

  it('should return success with new date/time when rescheduled', async () => {
    (mockAppointmentsService.reschedule as jest.Mock).mockResolvedValue(mockRescheduledAppointment);

    const result = await tool.func({
      appointmentId: 'APT-001',
      newDate: '2026-10-25',
      newTime: '14:00',
    });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.appointmentId).toBe('APT-001');
  });

  it('should return error JSON when reschedule throws', async () => {
    (mockAppointmentsService.reschedule as jest.Mock).mockRejectedValue(
      new Error('Cannot reschedule cancelled appointment'),
    );

    const result = await tool.func({
      appointmentId: 'APT-001',
      newDate: '2026-10-25',
      newTime: '14:00',
    });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
  });
});
