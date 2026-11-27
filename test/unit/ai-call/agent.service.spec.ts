import { ConfigService } from '@nestjs/config';
import { AgentService } from '../../../src/langchain/agent/agent.service';
import {
  buildSystemPrompt,
  OUT_OF_SCOPE_RESPONSE_EN,
  OUT_OF_SCOPE_RESPONSE_FR,
} from '../../../src/langchain/prompts/system.prompt';

describe('AgentService & System Prompt', () => {
  let service: AgentService;

  const mockSlot = {
    id: 'slot-1',
    date: '2026-11-28',
    startTime: '09:00 AM',
    endTime: '09:30 AM',
    mode: 1,
    officeAvailabilityId: null,
    physicianAptTypeId: null,
  };

  const baseParams = {
    callId: 'call-1',
    patientId: 'pat-1',
    assignmentsId: 'assign-1',
    assignedPhysicianId: 'phys-1',
    slotId: 'slot-1',
    clinicId: 'clinic-1',
    twilioCallSid: 'CA123',
    language: 'en',
    callType: 'appointment_confirmation',
    conversationHistory: [],
    phoneNumber: '+18735060917',
  };

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_API_KEY') return 'test-key';
        if (key === 'GEMINI_MODEL') return 'gemini-3.5-flash-lite';
        return undefined;
      }),
    } as unknown as ConfigService;

    const patientsService = {
      findById: jest.fn().mockResolvedValue({
        id: 'pat-1',
        firstName: 'Suresh',
        lastName: 'Bhai',
        phone: '+18735060917',
        email: 'suresh@example.com',
        dateOfBirth: '1985-05-10',
        address: '100 Main Street',
        city: 'Toronto',
        zipCode: 'M5V 1A1',
      }),
    } as any;

    const langsmithService = {} as any;
    const slotRepo = { findOne: jest.fn().mockResolvedValue(mockSlot) } as any;
    const assignmentRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'assign-1',
        referralId: 'SU-000002',
        chiefComplaint: 'Knee pain',
      }),
    } as any;
    const clinicRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'clinic-1',
        name: 'Hope One Clinic',
        address: '200 Clinic Way',
        contactPhone: '+14165550100',
        contactEmail: 'info@hopeone.ca',
      }),
    } as any;
    const physicianRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'phys-1',
        firstName: 'Vikram',
        lastName: 'Makhija',
        bio: 'Orthopedic Specialist',
        phone: '+14165550200',
      }),
    } as any;
    const officeAvailRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
    const aptTypeRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
    const physicianSpecialtyRepo = {
      find: jest.fn().mockResolvedValue([{ specialty: { name: 'Orthopedics' } }]),
    } as any;

    service = new AgentService(
      configService,
      patientsService,
      langsmithService,
      slotRepo,
      assignmentRepo,
      clinicRepo,
      physicianRepo,
      officeAvailRepo,
      aptTypeRepo,
      physicianSpecialtyRepo,
    );
  });

  it('delivers immediate Turn 2 greeting on LANGUAGE_SELECTED without calling LLM', async () => {
    const res = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'LANGUAGE_SELECTED',
      pendingAction: null,
    });

    expect(res.intentPath).toBe('FAST_PATH');
    expect(res.isComplete).toBe(false);
    expect(res.nextPendingAction).toBeNull();
    expect(res.response).toContain('Suresh Bhai');
    expect(res.response).toContain('Hope One Clinic');
    expect(res.response).toContain('Vikram Makhija');
    expect(res.response).toContain('Saturday, November 28, 2026 at 09:00 AM');
  });

  it('enforces 2-step confirm flow accurately ("please confirm appointment" -> "Are you sure?" -> "yes confirm")', async () => {
    const step1 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'please confirm appointment',
      pendingAction: null,
    });

    expect(step1.intentPath).toBe('FAST_PATH');
    expect(step1.isComplete).toBe(false);
    expect(step1.actionResult).toBeNull();
    expect(step1.nextPendingAction).toBe('CONFIRM');
    expect(step1.response.toLowerCase()).toContain('are you sure');

    const step2 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'yes please confirm it',
      pendingAction: step1.nextPendingAction,
    });

    expect(step2.intentPath).toBe('FAST_PATH');
    expect(step2.isComplete).toBe(true);
    expect(step2.actionResult).toBe('CONFIRMED');
    expect(step2.nextPendingAction).toBeNull();
  });

  it('enforces 2-step cancel flow accurately ("cancel" -> "Are you sure?" -> "okay cancel it")', async () => {
    const step1 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'I want to cancel my appointment',
      pendingAction: null,
    });

    expect(step1.isComplete).toBe(false);
    expect(step1.nextPendingAction).toBe('CANCEL');
    expect(step1.response.toLowerCase()).toContain('are you sure');

    const step2 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'okay cancel it',
      pendingAction: step1.nextPendingAction,
    });

    expect(step2.isComplete).toBe(true);
    expect(step2.actionResult).toBe('CANCELLED');
    expect(step2.nextPendingAction).toBeNull();
  });

  it('supports switching from confirm to cancel mid-flow and declining confirmation', async () => {
    const step1 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'confirm',
      pendingAction: null,
    });
    expect(step1.nextPendingAction).toBe('CONFIRM');

    const declined = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'no wait',
      pendingAction: 'CONFIRM',
    });
    expect(declined.isComplete).toBe(false);
    expect(declined.nextPendingAction).toBeNull();

    const switched = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'cancel instead',
      pendingAction: 'CONFIRM',
    });
    expect(switched.isComplete).toBe(false);
    expect(switched.nextPendingAction).toBe('CANCEL');
    expect(switched.response.toLowerCase()).toContain('are you sure you want to cancel');
  });

  it('blocks premature [SLOT_CONFIRMED] from LLM when pendingAction is null and asks double-confirmation', async () => {
    jest.spyOn(service as any, 'createModel').mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        content: 'Sure, confirmed! [SLOT_CONFIRMED] [CALL_COMPLETE]',
      }),
    });

    const res = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'Where is the clinic? Also please confirm my appointment',
      pendingAction: null,
    });

    expect(res.intentPath).toBe('LLM');
    expect(res.isComplete).toBe(false);
    expect(res.actionResult).toBeNull();
    expect(res.nextPendingAction).toBe('CONFIRM');
    expect(res.response.toLowerCase()).toContain('are you sure');
  });

  it('builds English and French prompts with strict scope guardrails and all 4 DB sections', () => {
    const enPrompt = buildSystemPrompt({
      language: 'en',
      patientName: 'Suresh Bhai',
      clinicName: 'Hope One Clinic',
      clinicAddress: '200 Clinic Way',
      physicianName: 'Vikram Makhija',
      physicianSpecialties: 'Orthopedics',
      appointmentDate: 'Saturday, November 28, 2026 at 09:00 AM',
    });

    expect(enPrompt).toContain('1. APPOINTMENT:');
    expect(enPrompt).toContain('2. CLINIC:');
    expect(enPrompt).toContain('3. PHYSICIAN:');
    expect(enPrompt).toContain('4. PATIENT:');
    expect(enPrompt).toContain(OUT_OF_SCOPE_RESPONSE_EN);

    const frPrompt = buildSystemPrompt({
      language: 'fr',
      patientName: 'Suresh Bhai',
      clinicName: 'Hope One Clinic',
      physicianName: 'Vikram Makhija',
      appointmentDate: 'samedi 28 novembre 2026 à 09 heures 00',
    });
    expect(frPrompt).toContain(OUT_OF_SCOPE_RESPONSE_FR);
  });
});
