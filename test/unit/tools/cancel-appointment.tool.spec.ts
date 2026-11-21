import { createCancelAppointmentTool } from '../../../src/langchain/tools/cancel-appointment.tool';
import { AppointmentsService } from '../../../src/appointments/appointments.service';

const mockCancelledAppointment = {
  id: 'APT-001',
  patientId: 'PAT-001',
  status: 'CANCELLED',
  cancelReason: 'Patient request',
};

describe('CancelAppointmentTool', () => {
  let tool: any;
  let mockAppointmentsService: Partial<jest.Mocked<AppointmentsService>>;

  beforeEach(() => {
    mockAppointmentsService = {
      cancel: jest.fn(),
    };
    tool = createCancelAppointmentTool(mockAppointmentsService as unknown as AppointmentsService);
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('cancelAppointment');
  });

  it('should return success JSON when appointment is cancelled with reason', async () => {
    (mockAppointmentsService.cancel as jest.Mock).mockResolvedValue(mockCancelledAppointment);

    const result = await tool.func({ appointmentId: 'APT-001', reason: 'Patient request' });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.appointmentId).toBe('APT-001');
  });

  it('should return success JSON when appointment is cancelled without reason', async () => {
    (mockAppointmentsService.cancel as jest.Mock).mockResolvedValue(mockCancelledAppointment);

    const result = await tool.func({ appointmentId: 'APT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
  });

  it('should return error JSON when cancel throws', async () => {
    (mockAppointmentsService.cancel as jest.Mock).mockRejectedValue(new Error('Cancel failed'));

    const result = await tool.func({ appointmentId: 'APT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
  });
});
