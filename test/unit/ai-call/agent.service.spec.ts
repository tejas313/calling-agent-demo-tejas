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
    const dataSource = {
      query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('FROM clinics')) {
          return [
            {
              id: 'clinic-1',
              name: 'Hope One Clinic',
              address: '200 Clinic Way',
              contactPhone: '+14165550100',
              contactEmail: 'info@hopeone.ca',
            },
          ];
        }
        if (sql.includes('FROM physician_clinic_profiles')) {
          return [
            {
              id: 'phys-1',
              firstName: 'Vikram',
              lastName: 'Makhija',
              bio: 'Orthopedic Specialist',
              phone: '+14165550200',
            },
          ];
        }
        if (sql.includes('FROM physician_patient_slots')) {
          return [mockSlot];
        }
        if (sql.includes('FROM triage_assignments')) {
          return [
            {
              id: 'assign-1',
              referralId: 'SU-000002',
              chiefComplaint: 'Knee pain',
            },
          ];
        }
        if (sql.includes('FROM physician_clinic_specialties')) {
          return [
            {
              id: 'pcs-1',
              s_id: 'spec-1',
              s_name: 'Orthopedics',
            },
          ];
        }
        if (sql.includes('FROM office_availability')) {
          return [];
        }
        if (sql.includes('FROM physician_appointment_types')) {
          return [];
        }
        return [];
      }),
    } as any;

    service = new AgentService(
      configService,
      patientsService,
      langsmithService,
      dataSource,
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
    expect(res.response).toBe(
      'Hi Suresh, this is Hope One Clinic calling. We have an appointment slot available with Dr. Vikram Makhija on Saturday, November 28th, at 9 AM. Would you like to confirm this appointment, or would you prefer to cancel?',
    );
    expect(res.response.toLowerCase()).not.toContain('got it');
  });

  it('formats ordinal dates like December 2nd in Turn 2 greeting', async () => {
    const decSlot = {
      ...mockSlot,
      id: 'slot-dec-2',
      date: '2026-12-02',
      startTime: '09:00 AM',
    };
    const origQuery = (service as any).dataSource.query;
    (service as any).dataSource.query = jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM physician_patient_slots')) {
        return [decSlot];
      }
      return origQuery(sql, params);
    });

    const res = await service.runAgentTurn({
      ...baseParams,
      callId: 'call-dec-2',
      slotId: 'slot-dec-2',
      userMessage: 'LANGUAGE_SELECTED',
      pendingAction: null,
    });

    expect(res.response).toBe(
      'Hi Suresh, this is Hope One Clinic calling. We have an appointment slot available with Dr. Vikram Makhija on Wednesday, December 2nd, at 9 AM. Would you like to confirm this appointment, or would you prefer to cancel?',
    );
  });

  it('enforces 2-step cross-verification confirm flow without "Got it" or "double-check" filler', async () => {
    const step1 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'please confirm appointment',
      pendingAction: null,
    });

    expect(step1.intentPath).toBe('FAST_PATH');
    expect(step1.isComplete).toBe(false);
    expect(step1.actionResult).toBeNull();
    expect(step1.nextPendingAction).toBe('CONFIRM');
    expect(step1.response.toLowerCase()).toContain('are you sure you want to confirm');
    expect(step1.response.toLowerCase()).not.toContain('got it');
    expect(step1.response.toLowerCase()).not.toContain('double-check');
    expect(step1.response).toContain('Doctor Vikram Makhija');

    const step2 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'yes',
      pendingAction: 'CONFIRM',
    });

    expect(step2.intentPath).toBe('FAST_PATH');
    expect(step2.isComplete).toBe(true);
    expect(step2.actionResult).toBe('CONFIRMED');
    expect(step2.nextPendingAction).toBeNull();
    expect(step2.response.toLowerCase()).toContain('confirmed');
  });

  it('enforces 2-step cross-verification cancel flow without filler words', async () => {
    const step1 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'I want to cancel my appointment',
      pendingAction: null,
    });

    expect(step1.intentPath).toBe('FAST_PATH');
    expect(step1.isComplete).toBe(false);
    expect(step1.actionResult).toBeNull();
    expect(step1.nextPendingAction).toBe('CANCEL');
    expect(step1.response.toLowerCase()).toContain('are you sure you want to cancel');
    expect(step1.response.toLowerCase()).not.toContain('got it');
    expect(step1.response.toLowerCase()).not.toContain('double-check');
    expect(step1.response.toLowerCase()).not.toMatch(/^okay\b/);
    expect(step1.response).toContain('Doctor Vikram Makhija');

    const step2 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'yes sure',
      pendingAction: 'CANCEL',
    });

    expect(step2.intentPath).toBe('FAST_PATH');
    expect(step2.isComplete).toBe(true);
    expect(step2.actionResult).toBe('CANCELLED');
    expect(step2.nextPendingAction).toBeNull();
    expect(step2.response.toLowerCase()).toContain('cancelled');
  });

  it('clarifies bare "yes" on pendingAction=null instead of blindly confirming', async () => {
    const res = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'yes',
      pendingAction: null,
    });

    expect(res.intentPath).toBe('FAST_PATH');
    expect(res.isComplete).toBe(false);
    expect(res.actionResult).toBeNull();
    expect(res.nextPendingAction).toBeNull();
    expect(res.response.toLowerCase()).toContain('confirm');
    expect(res.response.toLowerCase()).toContain('cancel');
  });

  it('cross-verifies when caller switches intent mid-verification and safely handles negated cancel/no', async () => {
    const switchedToCancel = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'actually cancel it',
      pendingAction: 'CONFIRM',
    });
    expect(switchedToCancel.isComplete).toBe(false);
    expect(switchedToCancel.actionResult).toBeNull();
    expect(switchedToCancel.nextPendingAction).toBe('CANCEL');
    expect(switchedToCancel.response.toLowerCase()).toContain('are you sure you want to cancel');

    const negatedCancel = await service.runAgentTurn({
      ...baseParams,
      userMessage: "no don't cancel",
      pendingAction: 'CANCEL',
    });
    expect(negatedCancel.isComplete).toBe(false);
    expect(negatedCancel.actionResult).toBeNull();
    expect(negatedCancel.nextPendingAction).toBeNull();

    const declined = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'no wait',
      pendingAction: 'CONFIRM',
    });
    expect(declined.isComplete).toBe(false);
    expect(declined.actionResult).toBeNull();
    expect(declined.nextPendingAction).toBeNull();
  });

  it('preserves LLM question answer AND prompts cross-verification for [INTENT_CONFIRM]', async () => {
    jest.spyOn(service as any, 'createModel').mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        content: 'Hope One Clinic is located at 200 Clinic Way. Would you like me to confirm? [INTENT_CONFIRM]',
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
    expect(res.response).toContain('200 Clinic Way');
    expect(res.response.toLowerCase()).toContain('are you sure you want to confirm');
  });

  it('handles reschedule and call-later requests cleanly and supports French cross-verification', async () => {
    const reschedule = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'Can I reschedule for another day?',
      pendingAction: null,
    });
    expect(reschedule.isComplete).toBe(true);
    expect(reschedule.actionResult).toBe('RESCHEDULED');
    expect(reschedule.response).toContain('+14165550100');

    const callLater = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'I am driving, call me later',
      pendingAction: null,
    });
    expect(callLater.isComplete).toBe(true);
    expect(callLater.actionResult).toBe('CALL_LATER');

    const frStep1 = await service.runAgentTurn({
      ...baseParams,
      language: 'fr',
      userMessage: 'je confirme mon rendez-vous',
      pendingAction: null,
    });
    expect(frStep1.isComplete).toBe(false);
    expect(frStep1.nextPendingAction).toBe('CONFIRM');
    expect(frStep1.response.toLowerCase()).toContain('êtes-vous sûr de vouloir confirmer');
    expect(frStep1.response).toContain('9 heures');
    expect(frStep1.response).not.toContain('09 heures 00 AM');
    expect(frStep1.response.toLowerCase()).not.toContain('juste pour vérifier');
  });

  it('repairs STT homophone "Please contact." -> confirm without breaking clinic contact or callback phrases', async () => {
    const step1 = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'Please contact.',
      pendingAction: null,
    });
    expect(step1.intentPath).toBe('FAST_PATH');
    expect(step1.normalizedUserMessage).toBe('Please confirm.');
    expect(step1.actionResult).toBeNull();
    expect(step1.nextPendingAction).toBe('CONFIRM');
    expect(step1.isComplete).toBe(false);

    // Callback phrase must NOT be rewritten to confirm
    const callbackRes = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'Please contact me later',
      pendingAction: null,
    });
    expect(callbackRes.intentPath).toBe('FAST_PATH');
    expect(callbackRes.normalizedUserMessage).toBe('Please contact me later');
    expect(callbackRes.actionResult).toBe('CALL_LATER');
    expect(callbackRes.isComplete).toBe(true);

    // Genuine clinic contact question must NOT be rewritten as confirm
    const invokeMock = jest.fn().mockResolvedValue({
      content: 'You can reach Hope One Clinic at +14165550100.',
    });
    jest.spyOn(service as any, 'createModel').mockReturnValue({ invoke: invokeMock });
    const qRes = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'How do I contact the clinic?',
      pendingAction: null,
    });
    expect(qRes.intentPath).toBe('LLM');
    expect(qRes.normalizedUserMessage).toBe('How do I contact the clinic?');
    expect(qRes.nextPendingAction).toBeNull();
  });

  it('does not misclassify "schedule for Monday" as confirming the offered slot and preserves verification reminder when LLM ends with a question', async () => {
    const scheduleInvoke = jest.fn().mockResolvedValue({
      content: 'Since I can only confirm or cancel this scheduled slot, please call Hope One Clinic to arrange Monday. [INTENT_RESCHEDULE]',
    });
    jest.spyOn(service as any, 'createModel').mockReturnValue({ invoke: scheduleInvoke });

    const mondayRes = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'Can you schedule for Monday?',
      pendingAction: null,
    });
    expect(mondayRes.intentPath).toBe('LLM');
    expect(mondayRes.actionResult).toBe('RESCHEDULED');
    expect(mondayRes.isComplete).toBe(true);

    const pendingInvoke = jest.fn().mockResolvedValue({
      content: 'Hope One Clinic is located at 200 Clinic Way. Did you have any other questions?',
    });
    jest.spyOn(service as any, 'createModel').mockReturnValue({ invoke: pendingInvoke });

    const pendingQ = await service.runAgentTurn({
      ...baseParams,
      userMessage: 'Where is the clinic located?',
      pendingAction: 'CONFIRM',
    });
    expect(pendingQ.intentPath).toBe('LLM');
    expect(pendingQ.nextPendingAction).toBe('CONFIRM');
    expect(pendingQ.response).toContain('200 Clinic Way');
    expect(pendingQ.response).toContain('Are you sure you want to confirm your appointment?');
  });

  it('builds English and French prompts without "Got it" filler and enforces all 4 DB sections', () => {
    const enPrompt = buildSystemPrompt({
      language: 'en',
      patientName: 'Suresh Bhai',
      clinicName: 'Hope One Clinic',
      clinicAddress: '200 Clinic Way',
      physicianName: 'Vikram Makhija',
      physicianSpecialties: 'Orthopedics',
      appointmentDate: 'Saturday, November 28 at 9 AM',
    });

    expect(enPrompt).toContain('1. APPOINTMENT:');
    expect(enPrompt).toContain('2. CLINIC:');
    expect(enPrompt).toContain('3. PHYSICIAN:');
    expect(enPrompt).toContain('4. PATIENT:');
    expect(enPrompt).toContain(OUT_OF_SCOPE_RESPONSE_EN);
    expect(enPrompt).toContain('NEVER start your reply with filler words like "Got it"');

    const frPrompt = buildSystemPrompt({
      language: 'fr',
      patientName: 'Suresh Bhai',
      clinicName: 'Hope One Clinic',
      physicianName: 'Vikram Makhija',
      appointmentDate: 'samedi 28 novembre à 9 heures',
    });
    expect(frPrompt).toContain(OUT_OF_SCOPE_RESPONSE_FR);
  });
});
