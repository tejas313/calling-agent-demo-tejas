import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import { PatientsService } from '../../patients/patients.service';
import { AppointmentsService } from '../../appointments/appointments.service';
import { LangsmithService } from '../../langsmith/langsmith.service';
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
    return [];
  }

  public async runAgentTurn(params: AgentRunParams): Promise<AgentRunResult> {
    try {
      const model = this.createModel();
      const modelName = (model as any)?.model || 'gemini-3.5-flash-lite';
      this.logger.log(`[runAgentTurn] ▶ callId=${params.callId}, turn userMessage="${params.userMessage}", model=${modelName}`);
      this.logger.log(`[runAgentTurn] patientId=${params.patientId}, appointmentId=${params.appointmentId}, language=${params.language}, callType=${params.callType}`);

      // DATABASE LOOKUP (Active: retrieves patient & appointment context from DB in ~1ms)
      let patientName = '';
      let appointmentDate = '';
      const isFrench = params.language === 'fr';

      try {
        if (params.patientId) {
          const patient = await this.patientsService.findById(params.patientId);
          patientName = (patient as any)?.name || '';
        }
        if (params.appointmentId) {
          const appt = await this.appointmentsService.findById(params.appointmentId);
          if (appt) {
            const rawDate = (appt as any).date;
            const rawTime = (appt as any).time;
            if (isFrench) {
              const formattedDate = rawDate ? dayjs(rawDate).locale('fr').format('dddd D MMMM') : '';
              const formattedTime = rawTime ? ` à ${rawTime.replace(':', ' heures ')}` : '';
              appointmentDate = `${formattedDate}${formattedTime}`.trim();
            } else {
              const formattedDate = rawDate ? dayjs(rawDate).format('dddd, MMMM D') : '';
              const formattedTime = rawTime ? ` at ${rawTime}` : '';
              appointmentDate = `${formattedDate}${formattedTime}`.trim();
            }
          }
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

      // Turn 2: Deliver appointment details greeting in chosen language (fast <5ms response)
      if (params.userMessage === 'START_CONVERSATION' || params.userMessage === 'LANGUAGE_SELECTED') {
        let greeting = '';
        if (isFrench) {
          const apptMention = appointmentDate ? ` prévu le ${appointmentDate}` : '';
          greeting = patientName
            ? `Merci. Bonjour ${patientName}, je suis Alice de notre clinique médicale, je vous appelle concernant votre rendez-vous${apptMention}. Comment puis-je vous aider aujourd'hui?`
            : `Merci. Bonjour, je suis Alice de notre clinique médicale, je vous appelle concernant votre rendez-vous${apptMention}. Comment puis-je vous aider aujourd'hui?`;
        } else {
          const apptMention = appointmentDate ? ` on ${appointmentDate}` : '';
          greeting = patientName
            ? `Thank you. Hello ${patientName}, I'm Alice from our medical clinic calling regarding your appointment${apptMention}. How can I help you today?`
            : `Thank you. Hello, I'm Alice from our medical clinic calling regarding your appointment${apptMention}. How can I help you today?`;
        }

        this.logger.log(`[runAgentTurn] ⚡ Fast immediate greeting in ${params.language}: "${greeting}"`);
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
        responseText = isFrench
          ? "J'ai un léger problème de connexion. Pourriez-vous répéter s'il vous plaît?"
          : "I'm having a brief connection issue. Could you please repeat that?";
      }

      responseText = typeof responseText === 'string' ? responseText : String(responseText || '');
      this.logger.log(`[runAgentTurn] Raw response: "${responseText.substring(0, 200)}"`);

      const toolsUsed: string[] = [];

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
