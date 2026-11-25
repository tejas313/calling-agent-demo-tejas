import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AiCallService } from '../../../src/ai-call/ai-call.service';
import { AiCall } from '../../../src/ai-call/entities/ai-call.entity';
import { TwilioService } from '../../../src/twilio/twilio.service';
import { AgentService } from '../../../src/langchain/agent/agent.service';
import { PatientsService } from '../../../src/patients/patients.service';
import { AppointmentsService } from '../../../src/appointments/appointments.service';
import { ClinicsService } from '../../../src/clinics/clinics.service';
import { WaitlistService } from '../../../src/waitlist/waitlist.service';
import { CallDirection, CallStatus } from '../../../src/common/constants';

describe('AiCallService Advanced Features', () => {
  let service: AiCallService;
  let mockAiCallRepo: any;
  let mockTwilioService: any;
  let mockAgentService: any;
  let mockPatientsService: any;
  let mockAppointmentsService: any;
  let mockClinicsService: any;
  let mockWaitlistService: any;

  beforeEach(async () => {
    mockAiCallRepo = {
      create: jest.fn((dto) => ({ id: 'call-inbound-1', ...dto })),
      save: jest.fn((c) => Promise.resolve(c)),
      findOne: jest.fn(),
    };

    mockTwilioService = {
      createOutboundCall: jest.fn().mockResolvedValue({ callSid: 'CA123' }),
      sendSms: jest.fn().mockResolvedValue({ success: true }),
      generateIncomingCallTwiML: jest.fn().mockReturnValue('<Response><Say>Welcome</Say></Response>'),
      generateHangupTwiML: jest.fn().mockReturnValue('<Response><Hangup/></Response>'),
    };

    mockAgentService = {
      runAgentTurn: jest.fn(),
    };

    mockPatientsService = {
      findByPhone: jest.fn().mockResolvedValue({ id: 'PAT-001', name: 'John Smith', language: 'en' }),
      logCommunication: jest.fn().mockResolvedValue({}),
    };

    mockAppointmentsService = {
      findByPatient: jest.fn().mockResolvedValue([
        { id: 'APT-001', date: new Date('2026-10-25'), time: '10:00', status: 'PENDING' },
      ]),
      confirm: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
      cancel: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
    };

    mockClinicsService = {
      findByPhoneNumber: jest.fn().mockResolvedValue({ id: 'CLINIC-001', name: 'Maple Leaf Clinic' }),
      findById: jest.fn().mockResolvedValue({ id: 'CLINIC-001', name: 'Maple Leaf Clinic' }),
    };

    mockWaitlistService = {
      findNextEligiblePatient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCallService,
        { provide: getRepositoryToken(AiCall), useValue: mockAiCallRepo },
        { provide: TwilioService, useValue: mockTwilioService },
        { provide: AgentService, useValue: mockAgentService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://api.clinic.com') } },
        { provide: PatientsService, useValue: mockPatientsService },
        { provide: AppointmentsService, useValue: mockAppointmentsService },
        { provide: ClinicsService, useValue: mockClinicsService },
        { provide: WaitlistService, useValue: mockWaitlistService },
      ],
    }).compile();

    service = module.get<AiCallService>(AiCallService);
  });

  it('should handle incoming patient phone call (Inbound Integration)', async () => {
    const twiml = await service.handleIncomingCall('+14165551001', '+18254511690', 'CA-IN-999');

    expect(twiml).toContain('<Response>');
    expect(mockAiCallRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: CallDirection.INBOUND,
        patientId: 'PAT-001',
        clinicId: 'CLINIC-001',
      }),
    );
    expect(mockPatientsService.logCommunication).toHaveBeenCalled();
  });

  it('should handle incoming SMS reply YES to confirm appointment (Scenario 19)', async () => {
    const result = await service.handleIncomingSms('+14165551001', '+18254511690', 'YES', 'SM123');

    expect(result.responseText).toContain('confirmed');
    expect(mockAppointmentsService.confirm).toHaveBeenCalledWith('APT-001');
    expect(mockTwilioService.sendSms).toHaveBeenCalled();
    expect(mockPatientsService.logCommunication).toHaveBeenCalled();
  });

  it('should handle ambiguous SMS response and ask clarification (Scenario 20)', async () => {
    const result = await service.handleIncomingSms('+14165551001', '+18254511690', 'Maybe, can I come later?', 'SM124');

    expect(result.responseText).toContain('reply YES');
    expect(mockAppointmentsService.confirm).not.toHaveBeenCalled();
    expect(mockPatientsService.logCommunication).toHaveBeenCalledWith(
      expect.objectContaining({
        finalWorkflowStatus: 'Awaiting Patient Confirmation',
      }),
    );
  });
});

