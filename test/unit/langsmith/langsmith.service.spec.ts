import { ConfigService } from '@nestjs/config';
import { LangsmithService } from '../../../src/langsmith/langsmith.service';

describe('LangsmithService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should disable tracing when API key is missing', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'LANGSMITH_TRACING') return 'true';
        if (key === 'LANGSMITH_PROJECT') return 'medi-schedule-ai-call-agent';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new LangsmithService(configService);
    expect(service.isTracingEnabled()).toBe(false);
    expect(service.getProjectName()).toBe('medi-schedule-ai-call-agent');
    expect(process.env.LANGCHAIN_TRACING_V2).toBe('false');
  });

  it('should enable tracing and sync env vars when LANGSMITH_TRACING=true and API key is set', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'LANGSMITH_TRACING') return 'true';
        if (key === 'LANGSMITH_API_KEY') return 'lsv2_pt_test_key';
        if (key === 'LANGSMITH_PROJECT') return 'medi-schedule-ai-call-agent';
        if (key === 'LANGSMITH_ENDPOINT') return 'https://api.smith.langchain.com';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new LangsmithService(configService);
    expect(service.isTracingEnabled()).toBe(true);
    expect(service.getClient()).toBeDefined();
    expect(process.env.LANGCHAIN_TRACING_V2).toBe('true');
    expect(process.env.LANGCHAIN_API_KEY).toBe('lsv2_pt_test_key');
    expect(process.env.LANGCHAIN_PROJECT).toBe('medi-schedule-ai-call-agent');
    expect(process.env.LANGCHAIN_ENDPOINT).toBe('https://api.smith.langchain.com');
  });

  it('should include thread_id and session_id in metadata and format tags', () => {
    const configService = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    const service = new LangsmithService(configService);
    const metadata = service.getMetadata({
      clinicId: 'clinic-1',
      patientId: 'pat-1',
      appointmentId: 'slot-1',
      callId: 'call-123',
      twilioCallSid: 'CA123',
      language: 'en',
      callType: 'APPOINTMENT_CONFIRMATION',
      model: 'gemini-3.5-flash-lite',
      turn: 2,
    });

    expect(metadata).toMatchObject({
      thread_id: 'call-123',
      session_id: 'call-123',
      callId: 'call-123',
      clinicId: 'clinic-1',
      patientId: 'pat-1',
      appointmentId: 'slot-1',
      twilioCallSid: 'CA123',
      language: 'en',
      callType: 'APPOINTMENT_CONFIRMATION',
      model: 'gemini-3.5-flash-lite',
      turn: 2,
    });
    expect(metadata.environment).toBeDefined();

    const tags = service.getTags({
      language: 'EN',
      callType: 'APPOINTMENT_CONFIRMATION',
      clinicId: 'clinic-1',
    });
    expect(tags).toEqual(['ai-call', 'appointment-confirmation', 'clinic-clinic-1', 'lang-en']);
  });

  it('should execute callback directly in traceRun when tracing is disabled', async () => {
    const configService = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    const service = new LangsmithService(configService);
    const result = await service.traceRun(
      {
        name: 'test-span',
        inputs: { hello: 'world' },
      },
      async (inp) => ({ echoed: inp.hello }),
    );

    expect(result).toEqual({ echoed: 'world' });
  });
});
