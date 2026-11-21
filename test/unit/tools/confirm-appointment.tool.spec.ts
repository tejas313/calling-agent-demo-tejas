import { createConfirmAppointmentTool } from '../../../src/langchain/tools/confirm-appointment.tool';
import { AppointmentsService } from '../../../src/appointments/appointments.service';

const mockConfirmedAppointment = {
  id: 'APT-001',
  patientId: 'PAT-001',
  status: 'CONFIRMED',
};

describe('ConfirmAppointmentTool', () => {
  let tool: any;
  let mockAppointmentsService: Partial<jest.Mocked<AppointmentsService>>;

  beforeEach(() => {
    mockAppointmentsService = {
      confirm: jest.fn(),
    };
    tool = createConfirmAppointmentTool(mockAppointmentsService as unknown as AppointmentsService);
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('confirmAppointment');
  });

  it('should return success JSON when appointment is confirmed', async () => {
    (mockAppointmentsService.confirm as jest.Mock).mockResolvedValue(mockConfirmedAppointment);

    const result = await tool.func({ appointmentId: 'APT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.appointmentId).toBe('APT-001');
  });

  it('should return error JSON when confirm throws', async () => {
    (mockAppointmentsService.confirm as jest.Mock).mockRejectedValue(
      new Error('Cannot confirm cancelled appointment'),
    );

    const result = await tool.func({ appointmentId: 'APT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
  });
});
