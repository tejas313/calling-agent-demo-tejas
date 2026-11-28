import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dayjs: typeof import('dayjs') = require('dayjs');
import { AiCallService } from '../../../src/ai-call/ai-call.service';
import { CallType } from '../../../src/common/constants';

describe('AiCallService', () => {
  let service: AiCallService;
  let aiCallRepo: any;
  let aiCallLogRepo: any;
  let patientRepo: any;
  let assignmentRepo: any;
  let physicianRepo: any;
  let slotRepo: any;
  let bookingRepo: any;
  let dataSource: any;
  let twilioService: any;
  let agentService: any;
  let queryHistory: { sql: string; params?: any[] }[];

  let mockPatient: any;
  let mockAssignment: any;
  let mockPhysician: any;
  let mockCandidateSlots: any[];

  const baseDto = {
    phoneNumber: '+18735060917',
    patientId: 'pat-1',
    clinicId: 'clinic-1',
    assignmentsId: 'assign-1',
    assigned_physician_id: 'phys-1',
    appointment_type_id: 'apt-type-1',
    language: 'en',
    callType: CallType.APPOINTMENT_CONFIRMATION,
    testMode: true,
  };

  beforeEach(() => {
    queryHistory = [];
    mockPatient = { id: 'pat-1', firstName: 'Suresh', lastName: 'Bhai' };
    mockAssignment = null;
    mockPhysician = { id: 'phys-1', clinicId: 'clinic-1' };
    mockCandidateSlots = [];

    dataSource = {
      query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        queryHistory.push({ sql, params });
        if (sql.includes('FROM patient_profiles')) {
          return mockPatient ? [mockPatient] : [];
        }
        if (sql.includes('FROM triage_assignments')) {
          return mockAssignment ? [mockAssignment] : [];
        }
        if (sql.includes('FROM physician_clinic_profiles')) {
          return mockPhysician ? [mockPhysician] : [];
        }
        if (sql.includes('FROM physician_patient_slots')) {
          return mockCandidateSlots;
        }
        if (sql.includes('INSERT INTO ai_calls') || sql.includes('UPDATE ai_calls')) {
          return [
            {
              id: 'call-1',
              patientId: 'pat-1',
              clinicId: 'clinic-1',
              assignmentsId: 'assign-1',
              assignedPhysicianId: 'phys-1',
              slotId: 'slot-1',
              status: 'initiated',
              currentTurn: 0,
              transcript: [],
              conversationHistory: [],
            },
          ];
        }
        if (sql.includes('INSERT INTO ai_call_logs')) {
          return [];
        }
        return [];
      }),
      transaction: jest.fn(async (cb) => {
        const manager = {
          query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
            queryHistory.push({ sql, params });
            if (sql.includes('FROM physician_patient_slots') && sql.includes('FOR UPDATE')) {
              return mockCandidateSlots;
            }
            if (sql.includes('FROM patient_appointment_bookings')) {
              return [];
            }
            if (sql.includes('UPDATE physician_patient_slots')) {
              return [];
            }
            if (sql.includes('INSERT INTO patient_appointment_bookings')) {
              return [{ id: 'booking-1' }];
            }
            return [];
          }),
        };
        return cb(manager);
      }),
    };

    twilioService = {
      createOutboundCall: jest.fn().mockResolvedValue({ callSid: 'CA-1' }),
    };
    agentService = {
      warmContext: jest.fn().mockResolvedValue(undefined),
      clearContextCache: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'PUBLIC_BASE_URL' ? 'https://example.trycloudflare.com' : undefined,
      ),
    } as unknown as ConfigService;

    service = new AiCallService(
      dataSource,
      twilioService,
      agentService,
      configService,
    );
  });

  it('blocks startCall and stores CALL_BLOCKED log when approvedDate is missing on triage assignment', async () => {
    mockAssignment = {
      id: 'assign-1',
      approvedDate: null,
      scheduleCount: 1,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    };

    await expect(service.startCall({ ...baseDto })).rejects.toThrow(BadRequestException);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_call_logs'),
      expect.arrayContaining(['CALL_BLOCKED']),
    );
    const hasAiCallInsert = queryHistory.some((q) => q.sql.includes('INSERT INTO ai_calls'));
    expect(hasAiCallInsert).toBe(false);
  });

  it('allows startCall even when approvedDate is earlier than today and forces minSlotDate to tomorrow', async () => {
    const pastDate = dayjs().subtract(5, 'day').toDate();
    const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');

    mockAssignment = {
      id: 'assign-1',
      approvedDate: pastDate,
      scheduleCount: 1,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    };

    mockCandidateSlots = [
      { id: 'slot-future', date: tomorrowStr, startTime: '10:00 AM', endTime: '10:30 AM', status: 1 },
    ];

    const res = await service.startCall({ ...baseDto });

    expect(res.success).toBe(true);
    expect(res.slot?.id).toBe('slot-future');
    const slotQuery = queryHistory.find((q) => q.sql.includes('FROM physician_patient_slots'));
    expect(slotQuery?.params).toContain(tomorrowStr);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_call_logs'),
      expect.arrayContaining(['CALL_INITIATED']),
    );
  });

  it('selects earliest chronological slot strictly after today and logs CALL_INITIATED with callReason', async () => {
    const today = dayjs().toDate();
    const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');

    mockAssignment = {
      id: 'assign-1',
      approvedDate: today,
      scheduleCount: 0,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    };

    // Deliberately return 01:00 PM before 09:00 AM to verify chronological sorting
    mockCandidateSlots = [
      { id: 'slot-pm', date: tomorrowStr, startTime: '01:00 PM', endTime: '01:30 PM', status: 1 },
      { id: 'slot-am', date: tomorrowStr, startTime: '09:00 AM', endTime: '09:30 AM', status: 1 },
    ];

    const res = await service.startCall({ ...baseDto });

    expect(res.success).toBe(true);
    expect(res.slot?.id).toBe('slot-am');
    expect(res.slot?.startTime).toBe('09:00 AM');
    expect(res.callReason).toContain('slot-am');
    const slotQuery = queryHistory.find((q) => q.sql.includes('FROM physician_patient_slots'));
    expect(slotQuery?.params).toContain(tomorrowStr);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_call_logs'),
      expect.arrayContaining(['CALL_INITIATED']),
    );
  });

  it('logs CALL_BLOCKED and throws NotFoundException when no slot exists after today', async () => {
    mockAssignment = {
      id: 'assign-1',
      approvedDate: dayjs().toDate(),
      scheduleCount: 1,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    };
    mockCandidateSlots = [];

    await expect(service.startCall({ ...baseDto })).rejects.toThrow(NotFoundException);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_call_logs'),
      expect.arrayContaining(['CALL_BLOCKED']),
    );
  });

  it('re-prompts caller politely on empty speech instead of stopping the call, and only ends after max retries', async () => {
    const mockAiCall = {
      id: 'call-reprompt-1',
      patientId: 'pat-1',
      clinicId: 'clinic-1',
      assignmentsId: 'assign-1',
      twilioCallSid: 'CA123',
      language: 'en',
      status: 'IN_PROGRESS',
      currentTurn: 2,
      transcript: [{ role: 'assistant', content: 'Would you like to confirm your appointment?' }],
      conversationHistory: [],
    };
    jest.spyOn(service as any, 'findAiCallById').mockResolvedValue(mockAiCall);
    jest.spyOn(service as any, 'saveAiCall').mockResolvedValue(mockAiCall);

    const twilioMock = {
      generateGatherTwiML: jest.fn((text: string) => `<Gather>${text}</Gather>`),
      generateTwiML: jest.fn((text: string) => `<Say>${text}</Say><Hangup/>`),
      generateLanguageSelectionTwiML: jest.fn(() => '<Gather>lang</Gather>'),
    };
    (service as any).twilioService = twilioMock;
    (service as any).configService = { get: jest.fn(() => 'https://example.com') };

    // First 3 empty speech events should re-prompt, not hang up
    for (let i = 0; i < 3; i++) {
      const twiml = await service.handleVoiceWebhook('call-reprompt-1', '', 'CA123');
      expect(twiml).toContain('Sorry, I didn\'t hear you clearly.');
      expect(twiml).toContain('Would you like to confirm your appointment?');
      expect(twiml).not.toContain('<Hangup/>');
    }

    // 4th consecutive empty speech exceeds MAX_NO_INPUT_RETRIES (3) and politely ends
    const finalTwiml = await service.handleVoiceWebhook('call-reprompt-1', '', 'CA123');
    expect(finalTwiml).toContain('<Hangup/>');
  });

  it('persists pendingAction on first confirm request and only books slot after caller cross-verifies', async () => {
    const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');
    mockCandidateSlots = [
      {
        id: 'slot-1',
        physicianProfileId: 'phys-1',
        date: tomorrowStr,
        startTime: '09:00 AM',
        endTime: '09:30 AM',
        status: 1,
      },
    ];
    const mockAiCall: any = {
      id: 'call-verify-1',
      patientId: 'pat-1',
      clinicId: 'clinic-1',
      assignmentsId: 'assign-1',
      assignedPhysicianId: 'phys-1',
      slotId: 'slot-1',
      phoneNumber: '+18735060917',
      twilioCallSid: 'CA123',
      language: 'en',
      callType: CallType.APPOINTMENT_CONFIRMATION,
      status: 'IN_PROGRESS',
      currentTurn: 2,
      pendingAction: null,
      transcript: [],
      conversationHistory: [],
    };
    jest.spyOn(service as any, 'findAiCallById').mockResolvedValue(mockAiCall);
    jest.spyOn(service as any, 'saveAiCall').mockImplementation(async (c: any) => c);

    (service as any).twilioService = {
      generateGatherTwiML: jest.fn((text: string) => `<Gather>${text}</Gather>`),
      generateTwiML: jest.fn((text: string) => `<Say>${text}</Say><Hangup/>`),
    };
    (service as any).configService = { get: jest.fn(() => 'https://example.com') };
    (service as any).agentService = {
      clearContextCache: jest.fn(),
      runAgentTurn: jest
        .fn()
        .mockResolvedValueOnce({
          response: 'Are you sure you want to confirm your appointment?',
          isComplete: false,
          actionResult: null,
          nextPendingAction: 'CONFIRM',
          intentPath: 'FAST_PATH',
          updatedHistory: [],
          toolsUsed: [],
        })
        .mockResolvedValueOnce({
          response: 'Your appointment is confirmed.',
          isComplete: true,
          actionResult: 'CONFIRMED',
          nextPendingAction: null,
          intentPath: 'FAST_PATH',
          updatedHistory: [],
          toolsUsed: [],
        }),
    };

    const turn3Twiml = await service.handleVoiceWebhook('call-verify-1', 'confirm', 'CA123');
    expect(turn3Twiml).toContain('<Gather>');
    expect(turn3Twiml.toLowerCase()).toContain('are you sure you want to confirm');
    expect(mockAiCall.pendingAction).toBe('CONFIRM');
    expect(dataSource.transaction).not.toHaveBeenCalled();

    const turn4Twiml = await service.handleVoiceWebhook('call-verify-1', 'yes', 'CA123');
    expect(turn4Twiml).toContain('<Hangup/>');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mockAiCall.outcome).toBe('CONFIRMED');
    expect(mockAiCall.pendingAction).toBeNull();
  });

  it('rejects invalid DTMF digit without incrementing currentTurn and preserves Turn 1 language + intent', async () => {
    const mockAiCall: any = {
      id: 'call-dtmf-1',
      patientId: 'pat-1',
      clinicId: 'clinic-1',
      assignmentsId: 'assign-1',
      assignedPhysicianId: 'phys-1',
      slotId: 'slot-1',
      phoneNumber: '+18735060917',
      twilioCallSid: 'CA123',
      language: 'en',
      callType: CallType.APPOINTMENT_CONFIRMATION,
      status: 'IN_PROGRESS',
      currentTurn: 2,
      pendingAction: null,
      transcript: [],
      conversationHistory: [],
    };
    jest.spyOn(service as any, 'findAiCallById').mockResolvedValue(mockAiCall);
    jest.spyOn(service as any, 'saveAiCall').mockImplementation(async (c: any) => c);

    const runAgentTurnMock = jest.fn().mockResolvedValue({
      response: 'Are you sure you want to confirm your appointment?',
      isComplete: false,
      actionResult: null,
      nextPendingAction: 'CONFIRM',
      intentPath: 'FAST_PATH',
      updatedHistory: [],
      toolsUsed: [],
    });
    (service as any).twilioService = {
      generateGatherTwiML: jest.fn((text: string) => `<Gather>${text}</Gather>`),
      generateTwiML: jest.fn((text: string) => `<Say>${text}</Say><Hangup/>`),
    };
    (service as any).configService = { get: jest.fn(() => 'https://example.com') };
    (service as any).agentService = {
      clearContextCache: jest.fn(),
      runAgentTurn: runAgentTurnMock,
    };

    const invalidTwiml = await service.handleVoiceWebhook('call-dtmf-1', undefined, 'CA123', '9');
    expect(invalidTwiml).toContain('did not recognize that keypad option');
    expect(mockAiCall.currentTurn).toBe(2);
    expect(runAgentTurnMock).not.toHaveBeenCalled();

    // Reset to Turn 1 and speak language + intent together
    mockAiCall.currentTurn = 1;
    await service.handleVoiceWebhook('call-dtmf-1', 'English, confirm my appointment', 'CA123');
    expect(mockAiCall.language).toBe('en');
    expect(mockAiCall.currentTurn).toBe(2);
    expect(runAgentTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'en',
        userMessage: 'confirm my appointment',
      }),
    );
  });

  it('clears pendingResponses, noInputRetryCounts, and contextCache on terminal status callback', async () => {
    const mockAiCall: any = {
      id: 'call-cleanup-1',
      patientId: 'pat-1',
      clinicId: 'clinic-1',
      assignmentsId: 'assign-1',
      twilioCallSid: 'CA-CLEAN',
      language: 'en',
      status: 'IN_PROGRESS',
      currentTurn: 2,
      transcript: [],
      conversationHistory: [],
    };
    jest.spyOn(service as any, 'findAiCallByTwilioSid').mockResolvedValue(mockAiCall);
    jest.spyOn(service as any, 'saveAiCall').mockImplementation(async (c: any) => c);

    (service as any).pendingResponses.set('call-cleanup-1', '<Response/>');
    (service as any).noInputRetryCounts.set('call-cleanup-1', 2);

    await service.handleStatusCallback({ CallSid: 'CA-CLEAN', CallStatus: 'failed' });

    expect((service as any).pendingResponses.has('call-cleanup-1')).toBe(false);
    expect((service as any).noInputRetryCounts.has('call-cleanup-1')).toBe(false);
    expect(agentService.clearContextCache).toHaveBeenCalledWith('call-cleanup-1');
  });
});
