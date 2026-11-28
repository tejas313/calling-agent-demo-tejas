import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'langsmith';
import { traceable } from 'langsmith/traceable';

export interface LangsmithMetadataParams {
  clinicId: string;
  patientId: string;
  appointmentId: string;
  callId: string;
  twilioCallSid: string;
  language: string;
  callType: string;
  model?: string;
  turn?: number;
  environment?: string;
  [key: string]: unknown;
}

export interface LangsmithTraceOptions<
  TInput extends Record<string, any> = Record<string, any>,
  TOutput = any,
> {
  name: string;
  runType?: 'chain' | 'llm' | 'tool' | 'retriever' | 'embedding' | 'prompt' | 'parser';
  inputs: TInput;
  metadata?: Record<string, unknown>;
  tags?: string[];
  processOutputs?: (outputs: Readonly<Record<string, any>>) => Record<string, any>;
}

@Injectable()
export class LangsmithService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangsmithService.name);
  private readonly tracingEnabled: boolean;
  private readonly apiKey: string;
  private readonly projectName: string;
  private readonly endpoint: string;
  private readonly client?: Client;

  constructor(private readonly configService: ConfigService) {
    const rawTracing =
      this.configService.get<string>('LANGSMITH_TRACING') ??
      this.configService.get<string>('LANGCHAIN_TRACING_V2') ??
      'false';

    this.apiKey =
      this.configService.get<string>('LANGSMITH_API_KEY') ??
      this.configService.get<string>('LANGCHAIN_API_KEY') ??
      '';

    this.projectName =
      this.configService.get<string>('LANGSMITH_PROJECT') ??
      this.configService.get<string>('LANGCHAIN_PROJECT') ??
      'medi-schedule-ai-call-agent';

    this.endpoint =
      this.configService.get<string>('LANGSMITH_ENDPOINT') ??
      this.configService.get<string>('LANGCHAIN_ENDPOINT') ??
      'https://api.smith.langchain.com';

    this.tracingEnabled = String(rawTracing).toLowerCase() === 'true' && Boolean(this.apiKey);

    try {
      // Sync both LANGCHAIN_* and LANGSMITH_* env vars so @langchain/core and langsmith SDK stay aligned
      process.env.LANGCHAIN_TRACING_V2 = this.tracingEnabled ? 'true' : 'false';
      process.env.LANGSMITH_TRACING = this.tracingEnabled ? 'true' : 'false';
      if (this.apiKey) {
        process.env.LANGCHAIN_API_KEY = this.apiKey;
        process.env.LANGSMITH_API_KEY = this.apiKey;
      }
      process.env.LANGCHAIN_PROJECT = this.projectName;
      process.env.LANGSMITH_PROJECT = this.projectName;
      process.env.LANGCHAIN_ENDPOINT = this.endpoint;
      process.env.LANGSMITH_ENDPOINT = this.endpoint;

      if (this.tracingEnabled) {
        this.client = new Client({
          apiKey: this.apiKey,
          apiUrl: this.endpoint,
        });
      }
    } catch (error: any) {
      this.logger.error(`Error initializing LangsmithService: ${error?.message}`, error?.stack);
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.tracingEnabled || !this.client) {
      this.logger.log('LangSmith tracing is disabled (missing LANGSMITH_TRACING=true or API key).');
      return;
    }

    await this.ensureProjectExists();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.awaitPendingTraceBatches();
    } catch (error: any) {
      this.logger.warn(`Error flushing LangSmith trace batches: ${error?.message}`);
    }
  }

  private async ensureProjectExists(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      const exists = await this.client.hasProject({ projectName: this.projectName });
      if (!exists) {
        await this.client.createProject({
          projectName: this.projectName,
          description: 'MediSchedule AI Call Agent traces',
        });
        this.logger.log(`Created LangSmith project "${this.projectName}"`);
      } else {
        this.logger.log(`LangSmith tracing connected to project "${this.projectName}"`);
      }
    } catch (error: any) {
      this.logger.warn(
        `Could not verify/create LangSmith project "${this.projectName}": ${error?.message}`,
      );
    }
  }

  getClient(): Client | undefined {
    return this.client;
  }

  getProjectName(): string {
    return this.projectName;
  }

  getMetadata(params: LangsmithMetadataParams): Record<string, unknown> {
    const {
      clinicId,
      patientId,
      appointmentId,
      callId,
      twilioCallSid,
      language,
      callType,
      model,
      turn,
      environment,
      ...rest
    } = params;

    return {
      ...rest,
      thread_id: callId,
      session_id: callId,
      clinicId,
      patientId,
      appointmentId,
      callId,
      twilioCallSid: twilioCallSid || '',
      language,
      callType,
      environment: environment ?? process.env.NODE_ENV ?? 'development',
      ...(model !== undefined ? { model } : {}),
      ...(turn !== undefined ? { turn } : {}),
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
    return this.tracingEnabled && Boolean(this.client);
  }

  /**
   * Executes `fn` inside a LangSmith traceable span when tracing is enabled.
   * Falls back to direct execution when tracing is disabled.
   */
  async traceRun<TInput extends Record<string, any>, TOutput>(
    options: LangsmithTraceOptions<TInput, TOutput>,
    fn: (inputs: TInput) => Promise<TOutput>,
  ): Promise<TOutput> {
    if (!this.isTracingEnabled() || !this.client) {
      return fn(options.inputs);
    }

    const tracedFn = traceable(fn, {
      name: options.name,
      run_type: options.runType ?? 'chain',
      project_name: this.projectName,
      client: this.client,
      tracingEnabled: true,
      metadata: options.metadata,
      tags: options.tags,
      processOutputs: options.processOutputs,
    }) as unknown as (inputs: TInput) => Promise<TOutput>;

    return tracedFn(options.inputs);
  }
}
