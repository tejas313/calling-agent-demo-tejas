import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AppointmentsService } from '../../../src/appointments/appointments.service';
import { Appointment } from '../../../src/appointments/entities/appointment.entity';
import { AppointmentStatus } from '../../../src/common/constants';

const mockAppointment: Partial<Appointment> = {
  id: 'APT-001',
  patientId: 'PAT-001',
  clinicId: 'CLINIC-001',
  physicianId: 'PHY-001',
  date: new Date('2026-10-15'),
  time: '10:00',
  appointmentType: 'Annual Physical',
  status: AppointmentStatus.PENDING,
  notes: null,
  callbackTime: null,
  cancelReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((apt) => Promise.resolve({ ...apt })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        {
          provide: getRepositoryToken(Appointment),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('findById', () => {
    it('should return appointment when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockAppointment);
      const result = await service.findById('APT-001');
      expect(result).toEqual(mockAppointment);
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.findById('APT-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm', () => {
    it('should confirm a PENDING appointment', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.PENDING,
      });
      const result = await service.confirm('APT-001');
      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it('should return as-is if already CONFIRMED', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CONFIRMED,
      });
      const result = await service.confirm('APT-001');
      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it('should throw BadRequestException if appointment is CANCELLED', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      });
      await expect(service.confirm('APT-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a PENDING appointment', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.PENDING,
      });
      const result = await service.cancel('APT-001', 'Changed mind');
      expect(result.status).toBe(AppointmentStatus.CANCELLED);
      expect(result.cancelReason).toBe('Changed mind');
    });

    it('should return as-is if already CANCELLED', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      });
      const result = await service.cancel('APT-001');
      expect(result.status).toBe(AppointmentStatus.CANCELLED);
    });
  });

  describe('reschedule', () => {
    it('should reschedule appointment with new date/time string', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.PENDING,
      });
      const result = await service.reschedule('APT-001', '2026-10-16', '11:00');
      expect(result.status).toBe(AppointmentStatus.RESCHEDULED);
      expect(result.time).toBe('11:00');
    });

    it('should throw BadRequestException if appointment is CANCELLED', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      });
      await expect(service.reschedule('APT-001', '2026-10-20', '10:00')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getAvailableSlots', () => {
    it('should return available time slots as array', async () => {
      mockRepository.find.mockResolvedValue([]);
      const slots = await service.getAvailableSlots('PHY-001', '2026-10-20');
      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
    });

    it('should exclude taken slots', async () => {
      mockRepository.find.mockResolvedValue([
        { ...mockAppointment, time: '09:00' },
        { ...mockAppointment, time: '10:00' },
      ]);
      const slots = await service.getAvailableSlots('PHY-001', '2026-10-20');
      expect(slots).not.toContain('09:00');
      expect(slots).not.toContain('10:00');
    });
  });

  describe('markCallLater', () => {
    it('should set callbackTime as string', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockAppointment });
      const result = await service.markCallLater('APT-001', 'tomorrow afternoon');
      expect(result.callbackTime).toBe('tomorrow afternoon');
    });
  });
});
