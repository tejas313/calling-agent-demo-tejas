import { createGetAppointmentTool } from '../../../src/langchain/tools/get-appointment.tool';
import { AppointmentsService } from '../../../src/appointments/appointments.service';
import { NotFoundException } from '@nestjs/common';

const mockAppointment = {
  id: 'APT-001',
  patientId: 'PAT-001',
  clinicId: 'CLINIC-001',
  physicianId: 'PHY-001',
  date: new Date('2026-10-15'),
  time: '10:00',
  appointmentType: 'Annual Physical',
  status: 'PENDING',
  notes: null,
  callbackTime: null,
  cancelReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GetAppointmentTool', () => {
  let tool: any;
  let mockAppointmentsService: Partial<jest.Mocked<AppointmentsService>>;

  beforeEach(() => {
    mockAppointmentsService = {
      findById: jest.fn(),
    };
    tool = createGetAppointmentTool(mockAppointmentsService as unknown as AppointmentsService);
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('getAppointment');
  });

  it('should return appointment details when patientId matches', async () => {
    (mockAppointmentsService.findById as jest.Mock).mockResolvedValue(mockAppointment);

    const result = await tool.func({ patientId: 'PAT-001', appointmentId: 'APT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe('APT-001');
    expect(parsed.time).toBe('10:00');
    expect(parsed.appointmentType).toBe('Annual Physical');
    expect(parsed.status).toBe('PENDING');
  });

  it('should return error when appointment belongs to different patient', async () => {
    (mockAppointmentsService.findById as jest.Mock).mockResolvedValue(mockAppointment);

    const result = await tool.func({ patientId: 'PAT-999', appointmentId: 'APT-001' });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('error');
  });

  it('should return error when appointment not found', async () => {
    (mockAppointmentsService.findById as jest.Mock).mockRejectedValue(
      new NotFoundException('Appointment not found'),
    );

    const result = await tool.func({ patientId: 'PAT-001', appointmentId: 'APT-999' });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('error');
  });
});
