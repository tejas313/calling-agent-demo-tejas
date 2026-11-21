import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// LANGGRAPH CODE COMMENTED OUT TEMPORARILY:
// import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { PatientsService } from '../../patients/patients.service';
import { AppointmentsService } from '../../appointments/appointments.service';
import { LangsmithService } from '../../langsmith/langsmith.service';
import {
  createVerifyPatientTool,
  createGetAppointmentTool,
  createConfirmAppointmentTool,
  createCancelAppointmentTool,
  createGetAvailableSlotsTool,
  createRescheduleAppointmentTool,
  createMarkCallLaterTool,
} from '../tools';
import { buildSystemPrompt, CALL_COMPLETE_MARKER } from '../prompts/system.prompt';

export interface AgentRunParams {
  callId: string;
  patientId: string;
  appointmentId: string;
  clinicId: string;
  twilioCallSid: string;
  language: string;
  callType: string;
  userMessage: string;
  conversationHistory: BaseMessage[];
  phoneNumber: string;
}

export interface AgentRunResult {
  response: string;
  isComplete: boolean;
  updatedHistory: BaseMessage[];
  toolsUsed: string[];
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly patientsService: PatientsService,
    private readonly appointmentsService: AppointmentsService,
    private readonly langsmithService: LangsmithService,
  ) {}

  private createModel() {
    const configuredModel = this.configService.get<string>('GEMINI_MODEL');
    // Force the working model: override broken/overloaded models (gemini-3.8-flash, gemini-2.0-flash, etc.)
    const activeModel =
      configuredModel &&
      !configuredModel.includes('3.8') &&
      !configuredModel.includes('2.0') &&
      !configuredModel.includes('3.0') &&
      !configuredModel.includes('1.5')
        ? configuredModel
        : 'gemini-3.5-flash-lite';

    return new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: activeModel,
      temperature: 0.3,
      maxOutputTokens: 512,
      maxRetries: 0,
    });
  }

  private createTools() {
    /* DATABASE TOOLS COMMENTED OUT (PURE CONVERSATIONAL MODE):
    return [
      createVerifyPatientTool(this.patientsService),
      createGetAppointmentTool(this.appointmentsService),
      createConfirmAppointmentTool(this.appointmentsService),
      createCancelAppointmentTool(this.appointmentsService),
      createGetAvailableSlotsTool(this.appointmentsService),
      createRescheduleAppointmentTool(this.appointmentsService),
      createMarkCallLaterTool(this.appointmentsService),
    ];
    */
    return [];
  }

  public async runAgentTurn(params: AgentRunParams): Promise<AgentRunResult> {
    try {
      const tools = this.createTools();
      const model = this.createModel();
      const modelName = (model as any)?.model || 'gemini-3.5-flash-lite';
      this.logger.log(`[runAgentTurn] ▶ callId=${params.callId}, turn userMessage="${params.userMessage}", model=${modelName}`);
      this.logger.log(`[runAgentTurn] patientId=${params.patientId}, appointmentId=${params.appointmentId}, language=${params.language}, callType=${params.callType}`);

      // DATABASE LOOKUP (Active: retrieves patient & appointment context from DB in ~1ms)
      let patientName = '';
      let appointmentDate = '';
      try {
        if (params.patientId) {
          const patient = await this.patientsService.findById(params.patientId);
          patientName = (patient as any)?.name || '';
        }
        if (params.appointmentId) {
          const appt = await this.appointmentsService.findById(params.appointmentId);
          const dateStr = (appt as any)?.date ? `${(appt as any).date}` : '';
          const timeStr = (appt as any)?.time ? ` at ${(appt as any).time}` : '';
          appointmentDate = `${dateStr}${timeStr}`.trim();
        }
      } catch (err: any) {
        this.logger.warn(`[runAgentTurn] Context lookup notice: ${err?.message}`);
      }

      this.logger.log(`[runAgentTurn] 💾 DB Context retrieved: Patient="${patientName || 'John'}", Appointment="${appointmentDate || 'upcoming slot'}"`);

      const systemPrompt = buildSystemPrompt({
        language: params.language,
        patientName,
        patientId: params.patientId,
        appointmentId: params.appointmentId,
        appointmentDate,
      });

      // Turn 1: Deliver immediate greeting without delay
      if (params.userMessage === 'START_CONVERSATION') {
        const apptMention = appointmentDate ? ` on ${appointmentDate}` : '';
        const greeting = patientName
          ? `Hello ${patientName}, I'm Alice from our medical clinic calling regarding your appointment${apptMention}. How can I help you today?`
          : `Hello, I'm Alice from our medical clinic calling regarding your appointment${apptMention}. How can I help you today?`;

        this.logger.log(`[runAgentTurn] ⚡ Turn 1 immediate greeting: "${greeting}"`);
        return {
          response: greeting,
          isComplete: false,
          updatedHistory: [
            ...params.conversationHistory,
            new AIMessage(greeting),
          ],
          toolsUsed: [],
        };
      }

      const messages = [
        new SystemMessage(systemPrompt),
        ...params.conversationHistory,
        new HumanMessage(params.userMessage),
      ];

      this.logger.log(`[runAgentTurn] Total messages sent to LLM: ${messages.length} (history=${params.conversationHistory.length})`);

      // DIRECT CONVERSATIONAL INVOCATION (DB tools & React Agent commented out below)
      this.logger.log(`[runAgentTurn] 🤖 Invoking LLM directly for conversation...`);
      let responseText = '';
      try {
        const responseMessage = await Promise.race([
          model.invoke(messages),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('LLM_TIMEOUT: Model took longer than 10 seconds')), 10000),
          ),
        ]);

        if (typeof responseMessage.content === 'string') {
          responseText = responseMessage.content;
        } else if (Array.isArray(responseMessage.content)) {
          responseText = responseMessage.content
            .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
            .join(' ');
        } else {
          responseText = String(responseMessage.content || '');
        }
      } catch (err: any) {
        this.logger.error(`[runAgentTurn] Error invoking LLM directly: ${err?.message}`);
        responseText = "I'm having a brief connection issue. Could you please repeat that?";
      }

      /* DATABASE TOOLS & REACT AGENT COMMENTED OUT:
      const agent = createReactAgent({
        llm: model,
        tools,
      });

      let langsmithMetadata = { callId: params.callId };
      let langsmithTags = ['ai-call'];

      if (this.langsmithService && typeof this.langsmithService.getMetadata === 'function') {
        langsmithMetadata = this.langsmithService.getMetadata(params) || langsmithMetadata;
      }
      if (this.langsmithService && typeof this.langsmithService.getTags === 'function') {
        langsmithTags = this.langsmithService.getTags(params) || langsmithTags;
      }

      const config = {
        configurable: { thread_id: params.callId },
        metadata: langsmithMetadata,
        tags: langsmithTags,
        runName: `ai-call-${params.callId}-turn`,
      };

      this.logger.log(`[runAgentTurn] 🤖 Invoking LangGraph agent...`);
      let result: any;
      try {
        const invokeWithTimeout = (cfg: any) =>
          Promise.race([
            agent.invoke({ messages }, cfg),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('AGENT_TIMEOUT: Agent took longer than 12 seconds')), 12000),
            ),
          ]);

        try {
          result = await invokeWithTimeout(config);
        } catch (invokeError: any) {
          if (
            invokeError?.message?.includes('401') ||
            invokeError?.message?.includes('Unauthorized') ||
            invokeError?.message?.includes('multipart')
          ) {
            this.logger.warn(`[runAgentTurn] ⚠️ LangSmith trace failed (${invokeError?.message?.substring(0, 80)}). Retrying WITHOUT tracing...`);
            result = await invokeWithTimeout({});
          } else {
            throw invokeError;
          }
        }
      } catch (error: any) {
        this.logger.error(`[runAgentTurn] Error invoking agent: ${error?.message}`);
        return {
          response: "I'm having a brief connection issue. Could you please repeat that?",
          isComplete: false,
          updatedHistory: [
            ...params.conversationHistory,
            new HumanMessage(params.userMessage),
            new AIMessage("I'm having a brief connection issue. Could you please repeat that?"),
          ],
          toolsUsed: [],
        };
      }
      this.logger.log(`[runAgentTurn] ✅ Agent returned ${result.messages.length} messages`);

      const lastMessage = result.messages[result.messages.length - 1] as AIMessage;
      let responseText = lastMessage.content as string;
      */

      responseText = typeof responseText === 'string' ? responseText : String(responseText || '');
      this.logger.log(`[runAgentTurn] Raw response: "${responseText.substring(0, 200)}"`);

      const toolsUsed: string[] = []; // DB tools commented out for conversational mode

      this.logger.log(`[runAgentTurn] Tools used: [${toolsUsed.join(', ') || 'none'}]`);

      const isComplete = responseText.includes(CALL_COMPLETE_MARKER);
      this.logger.log(`[runAgentTurn] isComplete=${isComplete} (marker found: ${isComplete})`);

      if (isComplete) {
        responseText = responseText.replace(CALL_COMPLETE_MARKER, '').trim();
      }

      const updatedHistory = [
        ...params.conversationHistory,
        new HumanMessage(params.userMessage),
        new AIMessage(responseText),
      ];

      return {
        response: responseText,
        isComplete,
        updatedHistory,
        toolsUsed,
      };
    } catch (error) {
      this.logger.error(`[runAgentTurn] ❌ FATAL ERROR for callId=${params.callId}`);
      this.logger.error(`[runAgentTurn] Error name: ${(error as any)?.name}`);
      this.logger.error(`[runAgentTurn] Error message: ${(error as any)?.message}`);
      this.logger.error(`[runAgentTurn] Stack:\n${(error as any)?.stack}`);
      throw error;
    }
  }
}
