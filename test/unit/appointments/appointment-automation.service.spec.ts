import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { AppointmentAutomationService } from '../../../src/appointments/appointment-automation.service';
import { Appointment } from '../../../src/appointments/entities/appointment.entity';
import { AiCall } from '../../../src/ai-call/entities/ai-call.entity';
import { PatientsService } from '../../../src/patients/patients.service';
import { CallStatus, CallOutcome } from '../../../src/common/constants';

describe('AppointmentAutomationService', () => {
  let service: AppointmentAutomationService;
  let mockApptRepo: any;
  let mockAiCallRepo: any;
  let mockPatientsService: any;

  beforeEach(async () => {
    mockApptRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((a) => Promise.resolve(a)),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    mockAiCallRepo = {
      find: jest.fn(),
      save: jest.fn((c) => Promise.resolve(c)),
    };

    mockPatientsService = {
      logCommunication: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentAutomationService,
        { provide: getRepositoryToken(Appointment), useValue: mockApptRepo },
        { provide: getRepositoryToken(AiCall), useValue: mockAiCallRepo },
        { provide: PatientsService, useValue: mockPatientsService },
      ],
    }).compile();

    service = module.get<AppointmentAutomationService>(AppointmentAutomationService);
  });

  it('should escalate unanswered call to Attempt 2 after 72 hours (Scenario 6)', async () => {
    const oldCall = {
      id: 'call-1',
      patientId: 'PAT-001',
      status: CallStatus.AWAITING_RESPONSE,
      startedAt: new Date(Date.now() - 75 * 60 * 60 * 1000),
    };
    mockAiCallRepo.find.mockResolvedValueOnce([oldCall]).mockResolvedValueOnce([]);

    const result = await service.run72HourFollowUpScan();

    expect(result.attempt2Initiated).toContain('call-1');
    expect(oldCall.status).toBe(CallStatus.CONTACT_ATTEMPT_2);
    expect(mockPatientsService.logCommunication).toHaveBeenCalled();
  });

  it('should mark call UNABLE_TO_REACH after 2 failed attempts (Scenario 7)', async () => {
    const expiredAttempt2Call: any = {
      id: 'call-2',
      patientId: 'PAT-002',
      status: CallStatus.CONTACT_ATTEMPT_2,
      startedAt: new Date(Date.now() - 150 * 60 * 60 * 1000),
    };
    mockAiCallRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([expiredAttempt2Call]);

    const result = await service.run72HourFollowUpScan();

    expect(result.markedUnreachable).toContain('call-2');
    expect(expiredAttempt2Call.status).toBe(CallStatus.UNABLE_TO_REACH);
    expect(expiredAttempt2Call.outcome).toBe(CallOutcome.UNREACHABLE);
  });
});
