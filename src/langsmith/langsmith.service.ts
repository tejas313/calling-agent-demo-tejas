import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LangsmithService {
  constructor(private readonly configService: ConfigService) {
    process.env.LANGCHAIN_TRACING_V2 = configService.get('LANGSMITH_TRACING', 'true');
    process.env.LANGCHAIN_API_KEY = configService.get('LANGSMITH_API_KEY', '');
    process.env.LANGCHAIN_PROJECT = configService.get(
      'LANGSMITH_PROJECT',
      'medi-schedule-ai-call-agent',
    );
    process.env.LANGCHAIN_ENDPOINT = configService.get(
      'LANGSMITH_ENDPOINT',
      'https://api.smith.langchain.com',
    );
  }

  getMetadata(params: {
    clinicId: string;
    patientId: string;
    appointmentId: string;
    callId: string;
    twilioCallSid: string;
    language: string;
    callType: string;
  }): Record<string, string> {
    return {
      clinicId: params.clinicId,
      patientId: params.patientId,
      appointmentId: params.appointmentId,
      callId: params.callId,
      twilioCallSid: params.twilioCallSid || '',
      language: params.language,
      callType: params.callType,
    };
  }

  getTags(params: { language: string; callType: string; clinicId: string }): string[] {
    return [
      'ai-call',
      params.callType.toLowerCase().replace(/_/g, '-'),
      `clinic-${params.clinicId}`,
      `lang-${params.language.toLowerCase()}`,
    ];
  }

  isTracingEnabled(): boolean {
    return process.env.LANGCHAIN_TRACING_V2 === 'true';
  }
}
