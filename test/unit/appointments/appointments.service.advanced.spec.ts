import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppointmentsService } from '../../../src/appointments/appointments.service';
import { Appointment } from '../../../src/appointments/entities/appointment.entity';
import { PatientsService } from '../../../src/patients/patients.service';
import { WaitlistService } from '../../../src/waitlist/waitlist.service';
import { ClinicalPriority, AppointmentStatus } from '../../../src/common/constants';

describe('AppointmentsService Advanced Features', () => {
  let service: AppointmentsService;
  let mockApptRepo: any;
  let mockPatientsService: any;
  let mockWaitlistService: any;

  beforeEach(async () => {
    mockApptRepo = {
      create: jest.fn((dto) => ({ id: 'apt-new', ...dto })),
      save: jest.fn((a) => Promise.resolve(a)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };

    mockPatientsService = {
      logCommunication: jest.fn().mockResolvedValue({}),
    };

    mockWaitlistService = {
      findNextEligiblePatient: jest.fn().mockResolvedValue({ id: 'w-1', patientId: 'PAT-WAIT' }),
      placeTemporaryHold: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Appointment), useValue: mockApptRepo },
        { provide: PatientsService, useValue: mockPatientsService },
        { provide: WaitlistService, useValue: mockWaitlistService },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  it('should support physician-approved overbooking', async () => {
    const result = await service.overbookAppointment({
      patientId: 'PAT-001',
      clinicId: 'CLINIC-001',
      physicianId: 'PHY-001',
      date: '2026-10-25',
      time: '10:00',
      appointmentType: 'Urgent Assessment',
      overbookingApprovedBy: 'PHY-001',
      notes: 'Doctor approved squeeze-in',
    });

    expect(result.isOverbooked).toBe(true);
    expect(result.overbookingApprovedBy).toBe('PHY-001');
    expect(result.status).toBe(AppointmentStatus.CONFIRMED);
    expect(mockPatientsService.logCommunication).toHaveBeenCalled();
  });

  it('should reschedule affected patients in priority order when physician cancels clinic (Scenario 27)', async () => {
    const affected = [
      { id: 'a1', patientId: 'p1', priority: ClinicalPriority.ROUTINE, status: AppointmentStatus.CONFIRMED, notes: '' },
      { id: 'a2', patientId: 'p2', priority: ClinicalPriority.RED_STAR, status: AppointmentStatus.CONFIRMED, notes: '' },
    ];
    mockApptRepo.find.mockResolvedValue(affected);

    const result = await service.cancelClinicSchedule('PHY-001', '2026-10-20', 'Illness');

    expect(result.affectedAppointments.length).toBe(2);
    // Red star prioritized before routine
    expect(result.affectedAppointments[0].priority).toBe(ClinicalPriority.RED_STAR);
    expect(result.affectedAppointments[0].status).toBe(AppointmentStatus.RESCHEDULED);
  });

  it('should notify upcoming patients when physician is running late (Scenario 28)', async () => {
    const upcoming = [
      { id: 'a1', patientId: 'p1', status: AppointmentStatus.CONFIRMED },
      { id: 'a2', patientId: 'p2', status: AppointmentStatus.CONFIRMED },
    ];
    mockApptRepo.find.mockResolvedValue(upcoming);

    const result = await service.notifyPhysicianRunningLate('PHY-001', '2026-10-15', 45);

    expect(result.notifiedCount).toBe(2);
    expect(mockPatientsService.logCommunication).toHaveBeenCalledTimes(2);
  });
});

