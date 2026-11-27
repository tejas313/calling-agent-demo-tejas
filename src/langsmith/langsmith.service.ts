import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LangsmithService {
  private readonly logger = new Logger(LangsmithService.name);

  constructor(private readonly configService: ConfigService) {
    try {
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
    } catch (error: any) {
      this.logger.error(`Error initializing LangsmithService: ${error?.message}`, error?.stack);
    }
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
    try {
      return {
        clinicId: params.clinicId,
        patientId: params.patientId,
        appointmentId: params.appointmentId,
        callId: params.callId,
        twilioCallSid: params.twilioCallSid || '',
        language: params.language,
        callType: params.callType,
      };
    } catch (error: any) {
      this.logger.error(`Error in getMetadata: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  getTags(params: { language: string; callType: string; clinicId: string }): string[] {
    try {
      return [
        'ai-call',
        params.callType.toLowerCase().replace(/_/g, '-'),
        `clinic-${params.clinicId}`,
        `lang-${params.language.toLowerCase()}`,
      ];
    } catch (error: any) {
      this.logger.error(`Error in getTags: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  isTracingEnabled(): boolean {
    try {
      return process.env.LANGCHAIN_TRACING_V2 === 'true';
    } catch (error: any) {
      this.logger.error(`Error in isTracingEnabled: ${error?.message}`, error?.stack);
      return false;
    }
  }
}
