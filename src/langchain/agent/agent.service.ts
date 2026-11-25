import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import {
  Clinic,
  PhysicianClinicProfile,
  PhysicianPatientSlot,
} from '../../entities';
import { PatientsService } from '../../patients/patients.service';
import { LangsmithService } from '../../langsmith/langsmith.service';
import {
  buildSystemPrompt,
  CALL_COMPLETE_MARKER,
  SLOT_CANCELLED_MARKER,
  SLOT_CONFIRMED_MARKER,
} from '../prompts/system.prompt';

export interface AgentRunParams {
  callId: string;
  patientId: string;
  assignmentsId?: string;
  assignedPhysicianId?: string;
  slotId?: string;
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
  actionResult: 'CONFIRMED' | 'CANCELLED' | null;
  updatedHistory: BaseMessage[];
  toolsUsed: string[];
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly patientsService: PatientsService,
    private readonly langsmithService: LangsmithService,
    @InjectRepository(PhysicianPatientSlot)
    private readonly slotRepository: Repository<PhysicianPatientSlot>,
    @InjectRepository(Clinic)
    private readonly clinicRepository: Repository<Clinic>,
    @InjectRepository(PhysicianClinicProfile)
    private readonly physicianRepository: Repository<PhysicianClinicProfile>,
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

  public async runAgentTurn(params: AgentRunParams): Promise<AgentRunResult> {
    try {
      const model = this.createModel();
      const modelName = (model as any)?.model || 'gemini-3.5-flash-lite';
      this.logger.log(
        `[runAgentTurn] ▶ callId=${params.callId}, turn userMessage="${params.userMessage}", model=${modelName}`,
      );

      let patientName = '';
      let clinicName = '';
      let physicianName = '';
      let appointmentDate = '';
      const isFrench = params.language === 'fr';

      try {
        if (params.patientId) {
          const patient = await this.patientsService.findById(params.patientId);
          patientName = `${patient.firstName} ${patient.lastName}`.trim();
        }
        if (params.clinicId) {
          const clinic = await this.clinicRepository.findOne({ where: { id: params.clinicId } });
          clinicName = clinic?.name || '';
        }
        if (params.assignedPhysicianId) {
          const physician = await this.physicianRepository.findOne({
            where: { id: params.assignedPhysicianId },
          });
          if (physician) {
            physicianName = `${physician.firstName} ${physician.lastName}`.trim();
          }
        }
        if (params.slotId) {
          const slot = await this.slotRepository.findOne({ where: { id: params.slotId } });
          if (slot) {
            const formattedDate = isFrench
              ? dayjs(slot.date).locale('fr').format('dddd D MMMM YYYY')
              : dayjs(slot.date).format('dddd, MMMM D, YYYY');
            const formattedTime = isFrench
              ? `${slot.startTime.replace(':', ' heures ')}`
              : `${slot.startTime}`;
            appointmentDate = isFrench
              ? `${formattedDate} à ${formattedTime}`
              : `${formattedDate} at ${formattedTime}`;
          }
        }
      } catch (dbErr: any) {
        this.logger.warn(`[runAgentTurn] DB context lookup warning: ${dbErr?.message}`);
      }

      this.logger.log(
        `[runAgentTurn] 💾 DB Context: Patient="${patientName}", Clinic="${clinicName}", Physician="${physicianName}", Slot="${appointmentDate}"`,
      );

      const systemPrompt = buildSystemPrompt({
        language: params.language,
        patientName: patientName || undefined,
        patientId: params.patientId,
        assignmentsId: params.assignmentsId,
        physicianName: physicianName || undefined,
        appointmentDate: appointmentDate || undefined,
        clinicName: clinicName || undefined,
      });

      // Turn 2: Language was just selected — deliver slot offer directly without an LLM round-trip
      if (params.userMessage === 'LANGUAGE_SELECTED') {
        const displaySlot =
          appointmentDate ||
          (isFrench ? 'votre prochain créneau disponible' : 'your upcoming available slot');
        const displayName = patientName ? (isFrench ? ` ${patientName}` : ` ${patientName}`) : '';
        const displayClinic = clinicName || (isFrench ? 'la clinique médicale' : 'the medical clinic');
        const displayPhysician = physicianName
          ? isFrench
            ? ` avec Docteur ${physicianName}`
            : ` with Doctor ${physicianName}`
          : '';

        const greeting = isFrench
          ? `Bonjour${displayName}, je vous appelle de ${displayClinic}. Nous avons un créneau disponible${displayPhysician} le ${displaySlot}. Souhaitez-vous confirmer ou annuler ce rendez-vous?`
          : `Hello${displayName}, I'm calling from ${displayClinic}. We have an available slot${displayPhysician} on ${displaySlot}. Would you like to confirm or cancel this appointment?`;

        this.logger.log(`[runAgentTurn] 🎙️ Delivering Turn 2 slot offer greeting: "${greeting}"`);
        return {
          response: greeting,
          isComplete: false,
          actionResult: null,
          updatedHistory: [...params.conversationHistory, new AIMessage(greeting)],
          toolsUsed: [],
        };
      }

      const messages = [
        new SystemMessage(systemPrompt),
        ...params.conversationHistory,
        new HumanMessage(params.userMessage),
      ];

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
        this.logger.error(`[runAgentTurn] Error invoking LLM: ${err?.message}`);
        responseText = isFrench
          ? "J'ai un léger problème de connexion. Pourriez-vous répéter s'il vous plaît?"
          : "I'm having a brief connection issue. Could you please repeat that?";
      }

      responseText = typeof responseText === 'string' ? responseText : String(responseText || '');
      this.logger.log(`[runAgentTurn] Raw response: "${responseText.substring(0, 200)}"`);

      let actionResult: 'CONFIRMED' | 'CANCELLED' | null = null;
      if (responseText.includes(SLOT_CONFIRMED_MARKER)) {
        actionResult = 'CONFIRMED';
      } else if (responseText.includes(SLOT_CANCELLED_MARKER)) {
        actionResult = 'CANCELLED';
      }

      const isComplete = responseText.includes(CALL_COMPLETE_MARKER) || actionResult !== null;

      responseText = responseText
        .replace(new RegExp(SLOT_CONFIRMED_MARKER.replace(/[[\]]/g, '\\$&'), 'g'), '')
        .replace(new RegExp(SLOT_CANCELLED_MARKER.replace(/[[\]]/g, '\\$&'), 'g'), '')
        .replace(new RegExp(CALL_COMPLETE_MARKER.replace(/[[\]]/g, '\\$&'), 'g'), '')
        .trim();

      if (!isComplete) {
        responseText = this.truncateToMaxSentences(responseText, 2);
      }

      const updatedHistory = [
        ...params.conversationHistory,
        new HumanMessage(params.userMessage),
        new AIMessage(responseText),
      ];

      return {
        response: responseText,
        isComplete,
        actionResult,
        updatedHistory,
        toolsUsed: [],
      };
    } catch (error: any) {
      this.logger.error(`[runAgentTurn] ❌ FATAL ERROR for callId=${params.callId}: ${error?.message}`);
      throw error;
    }
  }

  private truncateToMaxSentences(text: string, maxSentences: number = 2): string {
    if (!text) return text;
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s|$)/g;
    const sentences: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = sentenceRegex.exec(text)) !== null) {
      sentences.push(match[0]);
      if (sentences.length >= maxSentences) break;
    }

    if (sentences.length === 0) return text;
    return sentences.join('').trim();
  }
}
