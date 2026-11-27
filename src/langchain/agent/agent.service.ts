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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dayjs: typeof import('dayjs') = require('dayjs');
import 'dayjs/locale/fr';
import {
  Clinic,
  OfficeAvailability,
  PendingCallAction,
  PhysicianAppointmentType,
  PhysicianClinicProfile,
  PhysicianClinicSpecialty,
  PhysicianPatientSlot,
  TriageAssignment,
} from '../../entities';
import { PatientsService } from '../../patients/patients.service';
import { LangsmithService } from '../../langsmith/langsmith.service';
import {
  buildSystemPrompt,
  CALL_COMPLETE_MARKER,
  INTENT_CANCEL_MARKER,
  INTENT_CONFIRM_MARKER,
  INTENT_NO_MARKER,
  INTENT_YES_MARKER,
  PromptContext,
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
  pendingAction?: PendingCallAction;
}

export interface AgentRunResult {
  response: string;
  isComplete: boolean;
  actionResult: 'CONFIRMED' | 'CANCELLED' | null;
  nextPendingAction: PendingCallAction;
  intentPath: 'FAST_PATH' | 'LLM';
  updatedHistory: BaseMessage[];
  toolsUsed: string[];
  normalizedUserMessage?: string;
  sttHints?: string[];
  llmError?: string;
}

interface CachedCallContext {
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  patientDob?: string;
  patientAddress?: string;
  clinicName: string;
  clinicAddress?: string;
  clinicPhone?: string;
  clinicEmail?: string;
  officeName?: string;
  officeAddress?: string;
  officePhone?: string;
  physicianName: string;
  physicianSpecialties?: string;
  physicianBio?: string;
  physicianPhone?: string;
  slotDateRaw?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  appointmentType?: string;
  appointmentDuration?: number;
  appointmentMode?: string;
  referralId?: string;
  chiefComplaint?: string;
}

type FastIntent = 'CONFIRM' | 'CANCEL' | 'YES' | 'NO' | null;

const MODE_LABELS_EN: Record<number, string> = {
  1: 'In-person',
  2: 'Virtual',
  3: 'In-person or Virtual',
};

const MODE_LABELS_FR: Record<number, string> = {
  1: 'En personne',
  2: 'Virtuel',
  3: 'En personne ou virtuel',
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly contextCache = new Map<string, CachedCallContext>();

  constructor(
    private readonly configService: ConfigService,
    private readonly patientsService: PatientsService,
    private readonly langsmithService: LangsmithService,
    @InjectRepository(PhysicianPatientSlot)
    private readonly slotRepository: Repository<PhysicianPatientSlot>,
    @InjectRepository(TriageAssignment)
    private readonly assignmentRepository: Repository<TriageAssignment>,
    @InjectRepository(Clinic)
    private readonly clinicRepository: Repository<Clinic>,
    @InjectRepository(PhysicianClinicProfile)
    private readonly physicianRepository: Repository<PhysicianClinicProfile>,
    @InjectRepository(OfficeAvailability)
    private readonly officeAvailabilityRepository: Repository<OfficeAvailability>,
    @InjectRepository(PhysicianAppointmentType)
    private readonly appointmentTypeRepository: Repository<PhysicianAppointmentType>,
    @InjectRepository(PhysicianClinicSpecialty)
    private readonly physicianSpecialtyRepository: Repository<PhysicianClinicSpecialty>,
  ) {}

  private createModel() {
    try {
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
        temperature: 0.2,
        maxOutputTokens: 200,
        maxRetries: 0,
      });
    } catch (error: any) {
      this.logger.error(`Error in createModel: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * Pre-loads and caches call DB context in parallel (called during startCall
   * so the post-language-selection greeting and subsequent turns respond immediately).
   */
  public async warmContext(params: {
    callId: string;
    patientId: string;
    clinicId: string;
    assignedPhysicianId?: string;
    slotId?: string;
    assignmentsId?: string;
  }): Promise<void> {
    try {
      await this.getOrLoadContext(params);
    } catch (err: any) {
      this.logger.warn(`[warmContext] Non-fatal warm failure for callId=${params.callId}: ${err?.message}`);
    }
  }

  public clearContextCache(callId: string): void {
    try {
      this.contextCache.delete(callId);
    } catch (error: any) {
      this.logger.error(`Error in clearContextCache for callId=${callId}: ${error?.message}`, error?.stack);
    }
  }

  private async getOrLoadContext(params: {
    callId: string;
    patientId: string;
    clinicId: string;
    assignedPhysicianId?: string;
    slotId?: string;
    assignmentsId?: string;
  }): Promise<CachedCallContext> {
    try {
      const cached = this.contextCache.get(params.callId);
      if (cached) {
        return cached;
      }

    const [patientRes, clinicRes, physicianRes, slotRes, assignmentRes, specialtiesRes] =
      await Promise.all([
        params.patientId
          ? this.patientsService.findById(params.patientId).catch(() => null)
          : Promise.resolve(null),
        params.clinicId
          ? this.clinicRepository.findOne({ where: { id: params.clinicId } }).catch(() => null)
          : Promise.resolve(null),
        params.assignedPhysicianId
          ? this.physicianRepository
              .findOne({ where: { id: params.assignedPhysicianId } })
              .catch(() => null)
          : Promise.resolve(null),
        params.slotId
          ? this.slotRepository.findOne({ where: { id: params.slotId } }).catch(() => null)
          : Promise.resolve(null),
        params.assignmentsId
          ? this.assignmentRepository
              .findOne({ where: { id: params.assignmentsId } })
              .catch(() => null)
          : Promise.resolve(null),
        params.assignedPhysicianId
          ? this.physicianSpecialtyRepository
              .find({
                where: { physicianClinicProfileId: params.assignedPhysicianId },
                relations: ['specialty'],
              })
              .catch(() => [])
          : Promise.resolve([]),
      ]);

    const [officeAvailRes, aptTypeRes] = await Promise.all([
      slotRes?.officeAvailabilityId
        ? this.officeAvailabilityRepository
            .findOne({
              where: { id: slotRes.officeAvailabilityId },
              relations: ['office'],
            })
            .catch(() => null)
        : Promise.resolve(null),
      slotRes?.physicianAptTypeId || assignmentRes?.appointmentTypeId
        ? this.appointmentTypeRepository
            .findOne({
              where: {
                id: (slotRes?.physicianAptTypeId || assignmentRes?.appointmentTypeId) as string,
              },
              relations: ['consultationType', 'specialty'],
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const patientAddressParts = [patientRes?.address, patientRes?.city, patientRes?.zipCode]
      .filter(Boolean)
      .join(', ');

    const specialtyNames = (specialtiesRes || [])
      .map((s) => s.specialty?.name)
      .filter(Boolean)
      .join(', ');

    const appointmentTypeName =
      aptTypeRes?.customName ||
      aptTypeRes?.consultationType?.name ||
      aptTypeRes?.specialty?.name ||
      undefined;

    const contextData: CachedCallContext = {
      patientName: patientRes
        ? `${patientRes.firstName} ${patientRes.lastName}`.trim()
        : '',
      patientPhone: patientRes?.phone || undefined,
      patientEmail: patientRes?.email || undefined,
      patientDob: patientRes?.dateOfBirth
        ? dayjs(patientRes.dateOfBirth).format('MMMM D, YYYY')
        : undefined,
      patientAddress: patientAddressParts || undefined,
      clinicName: clinicRes?.name || '',
      clinicAddress: clinicRes?.address || undefined,
      clinicPhone: clinicRes?.contactPhone || undefined,
      clinicEmail: clinicRes?.contactEmail || undefined,
      officeName: officeAvailRes?.office?.name || undefined,
      officeAddress: officeAvailRes?.office?.address || undefined,
      officePhone: officeAvailRes?.office?.phone || undefined,
      physicianName: physicianRes
        ? `${physicianRes.firstName} ${physicianRes.lastName}`.trim()
        : '',
      physicianSpecialties: specialtyNames || undefined,
      physicianBio: physicianRes?.bio || undefined,
      physicianPhone: physicianRes?.phone || undefined,
      slotDateRaw: slotRes?.date || undefined,
      slotStartTime: slotRes?.startTime || undefined,
      slotEndTime: slotRes?.endTime || undefined,
      appointmentType: appointmentTypeName,
      appointmentDuration: aptTypeRes?.durationMinutes || undefined,
      appointmentMode: slotRes?.mode ? String(slotRes.mode) : undefined,
      referralId: assignmentRes?.referralId || undefined,
      chiefComplaint:
        assignmentRes?.chiefComplaint && assignmentRes.chiefComplaint.toLowerCase() !== 'none'
          ? assignmentRes.chiefComplaint
          : undefined,
    };

    this.contextCache.set(params.callId, contextData);
    return contextData;
    } catch (error: any) {
      this.logger.error(`Error in getOrLoadContext for callId=${params.callId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  private formatSlotForLanguage(ctx: CachedCallContext, language: string): string {
    if (!ctx.slotDateRaw || !ctx.slotStartTime) {
      return '';
    }
    const isFrench = language === 'fr';
    const formattedDate = isFrench
      ? dayjs(ctx.slotDateRaw).locale('fr').format('dddd D MMMM YYYY')
      : dayjs(ctx.slotDateRaw).format('dddd, MMMM D, YYYY');
    const formattedTime = isFrench
      ? ctx.slotStartTime.replace(':', ' heures ')
      : ctx.slotStartTime;
    return isFrench
      ? `${formattedDate} à ${formattedTime}`
      : `${formattedDate} at ${formattedTime}`;
  }

  private buildPromptContext(
    ctx: CachedCallContext,
    params: AgentRunParams,
    appointmentDate: string,
  ): PromptContext {
    const isFrench = params.language === 'fr';
    const modeNum = ctx.appointmentMode ? parseInt(ctx.appointmentMode, 10) : undefined;
    const modeLabel = modeNum
      ? isFrench
        ? MODE_LABELS_FR[modeNum]
        : MODE_LABELS_EN[modeNum]
      : undefined;

    return {
      language: params.language,
      patientName: ctx.patientName || undefined,
      patientId: params.patientId,
      patientPhone: ctx.patientPhone,
      patientEmail: ctx.patientEmail,
      patientDob: ctx.patientDob,
      patientAddress: ctx.patientAddress,
      assignmentsId: params.assignmentsId,
      referralId: ctx.referralId,
      chiefComplaint: ctx.chiefComplaint,
      physicianName: ctx.physicianName || undefined,
      physicianSpecialties: ctx.physicianSpecialties,
      physicianBio: ctx.physicianBio,
      physicianPhone: ctx.physicianPhone,
      appointmentDate: appointmentDate || undefined,
      appointmentEndTime: ctx.slotEndTime,
      appointmentType: ctx.appointmentType,
      appointmentDuration: ctx.appointmentDuration,
      appointmentMode: modeLabel,
      clinicName: ctx.clinicName || undefined,
      clinicAddress: ctx.clinicAddress,
      clinicPhone: ctx.clinicPhone,
      clinicEmail: ctx.clinicEmail,
      officeName: ctx.officeName,
      officeAddress: ctx.officeAddress,
      officePhone: ctx.officePhone,
      pendingAction: params.pendingAction ?? null,
    };
  }

  public async runAgentTurn(params: AgentRunParams): Promise<AgentRunResult> {
    try {
      const isFrench = params.language === 'fr';
      const ctx = await this.getOrLoadContext(params);
      const appointmentDate = this.formatSlotForLanguage(ctx, params.language);
      const sttHints = [
        ctx.clinicName,
        ctx.physicianName ? (isFrench ? `Docteur ${ctx.physicianName}` : `Doctor ${ctx.physicianName}`) : '',
        ctx.physicianName,
      ].filter(Boolean);

      this.logger.log(
        `[runAgentTurn] 💾 DB Context: Patient="${ctx.patientName}", Clinic="${ctx.clinicName}", Physician="${ctx.physicianName}", Slot="${appointmentDate}", pendingAction=${params.pendingAction ?? 'none'}`,
      );

      // Turn 2: Language just selected — deliver immediate slot offer without LLM round-trip
      if (params.userMessage === 'LANGUAGE_SELECTED') {
        const greeting = this.buildTurn2Greeting(ctx, appointmentDate, isFrench);
        this.logger.log(`[runAgentTurn] 🎙️ Fast Turn 2 greeting: "${greeting}"`);
        return {
          response: greeting,
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
          intentPath: 'FAST_PATH',
          sttHints,
          updatedHistory: [...params.conversationHistory, new AIMessage(greeting)],
          toolsUsed: [],
        };
      }

      const normalizedUserMessage = this.normalizeTelephonyStt(
        params.userMessage,
        params.pendingAction ?? null,
      );
      if (normalizedUserMessage !== params.userMessage) {
        this.logger.log(
          `[runAgentTurn] 🔧 STT normalized: "${params.userMessage}" -> "${normalizedUserMessage}"`,
        );
      }

      // Fast deterministic path for direct confirm / cancel / yes / no utterances
      const fastDecision = this.tryFastStateTransition(
        normalizedUserMessage,
        params.pendingAction ?? null,
        ctx,
        appointmentDate,
        isFrench,
      );
      if (fastDecision) {
        this.logger.log(
          `[runAgentTurn] ⚡ Fast-path transition: pending=${params.pendingAction ?? 'null'} -> next=${fastDecision.nextPendingAction ?? 'null'}, action=${fastDecision.actionResult ?? 'none'}`,
        );
        return {
          ...fastDecision,
          intentPath: 'FAST_PATH',
          normalizedUserMessage,
          sttHints,
          updatedHistory: [
            ...params.conversationHistory,
            new HumanMessage(normalizedUserMessage),
            new AIMessage(fastDecision.response),
          ],
          toolsUsed: [],
        };
      }

      // Conversational / Q&A / nuanced utterance -> invoke LLM with strict scope prompt
      const model = this.createModel();
      const promptCtx = this.buildPromptContext(ctx, params, appointmentDate);
      const systemPrompt = buildSystemPrompt(promptCtx);

      const messages = [
        new SystemMessage(systemPrompt),
        ...params.conversationHistory,
        new HumanMessage(normalizedUserMessage),
      ];

      let responseText = '';
      let llmError: string | undefined;
      try {
        const responseMessage = await Promise.race([
          model.invoke(messages),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('LLM_TIMEOUT: Model took longer than 7 seconds')),
              7000,
            ),
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
        llmError = err?.message || 'Unknown LLM error';
        this.logger.error(`[runAgentTurn] Error invoking LLM: ${llmError}`);
        responseText = isFrench
          ? "J'ai un léger problème de connexion. Pourriez-vous répéter s'il vous plaît?"
          : "I'm having a brief connection issue. Could you please repeat that?";
      }

      responseText = typeof responseText === 'string' ? responseText : String(responseText || '');
      this.logger.log(`[runAgentTurn] Raw LLM response: "${responseText.substring(0, 200)}"`);

      const resolved = this.enforceStateMachineOnLlmOutput(
        responseText,
        params.pendingAction ?? null,
        ctx,
        appointmentDate,
        isFrench,
      );

      return {
        ...resolved,
        intentPath: 'LLM',
        normalizedUserMessage,
        sttHints,
        llmError,
        updatedHistory: [
          ...params.conversationHistory,
          new HumanMessage(normalizedUserMessage),
          new AIMessage(resolved.response),
        ],
        toolsUsed: [],
      };
    } catch (error: any) {
      this.logger.error(
        `[runAgentTurn] ❌ FATAL ERROR for callId=${params.callId}: ${error?.message}`,
      );
      throw error;
    }
  }

  private buildTurn2Greeting(
    ctx: CachedCallContext,
    appointmentDate: string,
    isFrench: boolean,
  ): string {
    const displaySlot =
      appointmentDate ||
      (isFrench ? 'votre prochain créneau disponible' : 'your upcoming available slot');
    const displayName = ctx.patientName ? ` ${ctx.patientName}` : '';
    const displayClinic =
      ctx.clinicName || (isFrench ? 'la clinique médicale' : 'the medical clinic');
    const displayPhysician = ctx.physicianName
      ? isFrench
        ? ` avec Docteur ${ctx.physicianName}`
        : ` with Doctor ${ctx.physicianName}`
      : '';

    return isFrench
      ? `Bonjour${displayName}, je vous appelle de ${displayClinic}. Nous avons un créneau disponible${displayPhysician} le ${displaySlot}. Souhaitez-vous confirmer ou annuler ce rendez-vous?`
      : `Hello${displayName}, I'm calling from ${displayClinic}. We have an available slot${displayPhysician} on ${displaySlot}. Would you like to confirm or cancel this appointment?`;
  }

  private buildDoubleConfirmPrompt(
    action: 'CONFIRM' | 'CANCEL',
    ctx: CachedCallContext,
    appointmentDate: string,
    isFrench: boolean,
  ): string {
    const slotText =
      appointmentDate || (isFrench ? 'ce créneau' : 'this appointment slot');
    const physicianPart = ctx.physicianName
      ? isFrench
        ? ` avec Docteur ${ctx.physicianName}`
        : ` with Doctor ${ctx.physicianName}`
      : '';

    if (action === 'CONFIRM') {
      return isFrench
        ? `Êtes-vous sûr de vouloir confirmer votre rendez-vous${physicianPart} le ${slotText}?`
        : `Are you sure you want to confirm this appointment${physicianPart} for ${slotText}?`;
    }

    return isFrench
      ? `Êtes-vous sûr de vouloir annuler votre rendez-vous${physicianPart} le ${slotText}?`
      : `Are you sure you want to cancel this appointment${physicianPart} for ${slotText}?`;
  }

  private buildFinalSuccessMessage(
    action: 'CONFIRMED' | 'CANCELLED',
    ctx: CachedCallContext,
    appointmentDate: string,
    isFrench: boolean,
  ): string {
    const clinic =
      ctx.clinicName || (isFrench ? 'notre clinique' : 'our clinic');
    const slotText =
      appointmentDate || (isFrench ? 'ce créneau' : 'this slot');

    if (action === 'CONFIRMED') {
      return isFrench
        ? `Parfait, votre rendez-vous est confirmé et réservé pour le ${slotText}. Merci d'avoir choisi ${clinic}, bonne journée et au revoir!`
        : `Your appointment is confirmed and booked for ${slotText}. Thank you for choosing ${clinic}, have a great day and goodbye!`;
    }

    return isFrench
      ? `D'accord, votre rendez-vous du ${slotText} a été annulé. N'hésitez pas à contacter ${clinic} si besoin. Au revoir!`
      : `Okay, your appointment for ${slotText} has been cancelled. Please contact ${clinic} if you need further help. Goodbye!`;
  }

  /**
   * Repairs common 8kHz telephony STT homophone misrecognitions
   * (e.g. "Yes, please contact." -> "Yes, please confirm.") when the utterance
   * is a short command without question or clinic/doctor contact-info keywords.
   */
  private normalizeTelephonyStt(
    text: string,
    pendingAction: PendingCallAction,
  ): string {
    if (!text) return text;
    const lower = text.toLowerCase().trim();
    const wordCount = lower.replace(/[.,!?]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount === 0 || wordCount > 7) {
      return text;
    }

    const questionOrInfoTerms = [
      '?',
      'what',
      'where',
      'when',
      'who',
      'which',
      'how',
      'why',
      'clinic',
      'office',
      'doctor',
      'physician',
      'number',
      'phone',
      'email',
      'address',
      'reach',
      'details',
      'info',
      'quel',
      'quelle',
      'où',
      'quand',
      'comment',
      'clinique',
      'médecin',
    ];
    if (questionOrInfoTerms.some((term) => lower.includes(term))) {
      return text;
    }

    let repaired = text;

    // Common STT substitutions for "confirm" on narrowband phone audio
    const confirmHomophoneRegex = /\b(contact|confer|conform|conformed|conforming|corn firm|come firm|confim)\b/gi;
    const hasConfirmContext =
      pendingAction === 'CONFIRM' ||
      /\b(yes|yeah|yep|please|appointment|it)\b/i.test(lower) ||
      wordCount <= 2;
    if (hasConfirmContext && confirmHomophoneRegex.test(repaired)) {
      repaired = repaired.replace(confirmHomophoneRegex, 'confirm');
    }

    // Common STT substitutions for "cancel"
    const cancelHomophoneRegex = /\b(counsel|council|cansel|pencil)\b/gi;
    if (cancelHomophoneRegex.test(repaired)) {
      repaired = repaired.replace(cancelHomophoneRegex, 'cancel');
    }

    return repaired;
  }

  private classifyFastIntent(text: string, pendingAction: PendingCallAction): FastIntent {
    const normalized = text
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[.,!?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) return null;

    // If the utterance asks a question or asks for details, route to LLM
    const questionSignals = [
      '?',
      'what',
      'where',
      'when',
      'who',
      'which',
      'how',
      'why',
      'tell me',
      'address',
      'location',
      'phone',
      'number',
      'email',
      'specialty',
      'details',
      'info',
      'information',
      'quel',
      'quelle',
      'où',
      'quand',
      'qui',
      'comment',
      'pourquoi',
      'adresse',
      'téléphone',
      'courriel',
      'spécialité',
    ];
    if (questionSignals.some((sig) => text.toLowerCase().includes(sig))) {
      return null;
    }

    const words = normalized.split(' ');
    if (words.length > 9) {
      return null;
    }

    const hasCancel =
      /\b(cancel|cancelled|canceled|cancelling|annuler|annulez|annule|annulation)\b/.test(
        normalized,
      ) ||
      /\b(don't want|do not want|cannot make|can't make|not coming|skip it)\b/.test(
        normalized,
      );

    const hasConfirm =
      /\b(confirm|confirmed|confirming|book|book it|schedule|confirmer|confirme|confirmez|réserver)\b/.test(
        normalized,
      );

    // Avoid ambiguity if both appear in one utterance
    if (hasCancel && hasConfirm) {
      return null;
    }
    if (hasCancel) return 'CANCEL';
    if (hasConfirm) return 'CONFIRM';

    const isYes =
      /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|of course|definitely|absolutely|correct|right|i am sure|yes please|yes i am|oui|ouais|d'accord|daccord|bien sûr|parfait|volontiers)(\s+(please|sure|i am|it|that|s'il vous plaît|merci))?$/.test(
        normalized,
      );
    if (isYes) return 'YES';

    // During pending double-confirmation, any short affirmative opening without a negation is YES
    if (
      pendingAction !== null &&
      /^(yes|yeah|yep|sure|ok|okay|oui|d'accord|daccord)\b/.test(normalized) &&
      !/\b(no|not|don't|do not|wait|non|pas)\b/.test(normalized)
    ) {
      return 'YES';
    }

    const isNo =
      /^(no|nope|nah|not sure|not yet|not really|no wait|no thanks|no thank you|wait|hold on|never mind|nevermind|don't|do not|non|non merci|pas encore|attendez|pas sûr)(\s+(please|thanks|thank you|wait|s'il vous plaît|merci))?$/.test(
        normalized,
      );
    if (isNo) return 'NO';

    return null;
  }

  private tryFastStateTransition(
    userMessage: string,
    pendingAction: PendingCallAction,
    ctx: CachedCallContext,
    appointmentDate: string,
    isFrench: boolean,
  ): Omit<AgentRunResult, 'intentPath' | 'updatedHistory' | 'toolsUsed'> | null {
    const intent = this.classifyFastIntent(userMessage, pendingAction);
    if (!intent) return null;

    if (pendingAction === 'CONFIRM') {
      if (intent === 'CANCEL') {
        return {
          response: this.buildDoubleConfirmPrompt('CANCEL', ctx, appointmentDate, isFrench),
          isComplete: false,
          actionResult: null,
          nextPendingAction: 'CANCEL',
        };
      }
      if (intent === 'CONFIRM' || intent === 'YES') {
        return {
          response: this.buildFinalSuccessMessage('CONFIRMED', ctx, appointmentDate, isFrench),
          isComplete: true,
          actionResult: 'CONFIRMED',
          nextPendingAction: null,
        };
      }
      if (intent === 'NO') {
        return {
          response: isFrench
            ? 'D\'accord, je ne confirme pas encore. Souhaitez-vous confirmer, annuler, ou avez-vous une question sur le rendez-vous?'
            : 'Okay, I have not confirmed it yet. Would you like to confirm, cancel, or ask a question about the appointment?',
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
    }

    if (pendingAction === 'CANCEL') {
      if (intent === 'CONFIRM') {
        return {
          response: this.buildDoubleConfirmPrompt('CONFIRM', ctx, appointmentDate, isFrench),
          isComplete: false,
          actionResult: null,
          nextPendingAction: 'CONFIRM',
        };
      }
      if (intent === 'CANCEL' || intent === 'YES') {
        return {
          response: this.buildFinalSuccessMessage('CANCELLED', ctx, appointmentDate, isFrench),
          isComplete: true,
          actionResult: 'CANCELLED',
          nextPendingAction: null,
        };
      }
      if (intent === 'NO') {
        return {
          response: isFrench
            ? 'D\'accord, le rendez-vous n\'est pas annulé. Souhaitez-vous le confirmer ou avez-vous une question?'
            : 'Okay, I have not cancelled it. Would you like to confirm the appointment or ask a question?',
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
    }

    // pendingAction === null
    if (intent === 'CONFIRM' || intent === 'YES') {
      return {
        response: this.buildDoubleConfirmPrompt('CONFIRM', ctx, appointmentDate, isFrench),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CONFIRM',
      };
    }

    if (intent === 'CANCEL') {
      return {
        response: this.buildDoubleConfirmPrompt('CANCEL', ctx, appointmentDate, isFrench),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CANCEL',
      };
    }

    if (intent === 'NO') {
      return {
        response: isFrench
          ? 'D\'accord. Souhaitez-vous annuler ce rendez-vous ou avez-vous une question concernant le rendez-vous, la clinique ou le médecin?'
          : 'Okay. Would you like to cancel this appointment, or do you have a question about your appointment, clinic, physician, or patient details?',
        isComplete: false,
        actionResult: null,
        nextPendingAction: null,
      };
    }

    return null;
  }

  private enforceStateMachineOnLlmOutput(
    rawText: string,
    pendingAction: PendingCallAction,
    ctx: CachedCallContext,
    appointmentDate: string,
    isFrench: boolean,
  ): Omit<AgentRunResult, 'intentPath' | 'updatedHistory' | 'toolsUsed' | 'llmError'> {
    const hasConfirmSignal =
      rawText.includes(INTENT_CONFIRM_MARKER) || rawText.includes(SLOT_CONFIRMED_MARKER);
    const hasCancelSignal =
      rawText.includes(INTENT_CANCEL_MARKER) || rawText.includes(SLOT_CANCELLED_MARKER);
    const hasYesSignal = rawText.includes(INTENT_YES_MARKER);
    const hasNoSignal = rawText.includes(INTENT_NO_MARKER);

    const cleaned = this.stripAllMarkers(rawText);

    if (pendingAction === 'CONFIRM') {
      if (hasCancelSignal) {
        return {
          response: this.buildDoubleConfirmPrompt('CANCEL', ctx, appointmentDate, isFrench),
          isComplete: false,
          actionResult: null,
          nextPendingAction: 'CANCEL',
        };
      }
      if (hasYesSignal || hasConfirmSignal) {
        return {
          response: this.buildFinalSuccessMessage('CONFIRMED', ctx, appointmentDate, isFrench),
          isComplete: true,
          actionResult: 'CONFIRMED',
          nextPendingAction: null,
        };
      }
      if (hasNoSignal) {
        return {
          response:
            this.truncateToMaxSentences(cleaned, 2) ||
            (isFrench
              ? 'D\'accord. Souhaitez-vous confirmer ou annuler le rendez-vous?'
              : 'Okay. Would you like to confirm or cancel your appointment?'),
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
      // Question answered while pending confirmation — preserve pendingAction
      return {
        response: this.truncateToMaxSentences(cleaned, 2),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CONFIRM',
      };
    }

    if (pendingAction === 'CANCEL') {
      if (hasConfirmSignal) {
        return {
          response: this.buildDoubleConfirmPrompt('CONFIRM', ctx, appointmentDate, isFrench),
          isComplete: false,
          actionResult: null,
          nextPendingAction: 'CONFIRM',
        };
      }
      if (hasYesSignal || hasCancelSignal) {
        return {
          response: this.buildFinalSuccessMessage('CANCELLED', ctx, appointmentDate, isFrench),
          isComplete: true,
          actionResult: 'CANCELLED',
          nextPendingAction: null,
        };
      }
      if (hasNoSignal) {
        return {
          response:
            this.truncateToMaxSentences(cleaned, 2) ||
            (isFrench
              ? 'D\'accord. Souhaitez-vous confirmer ou annuler le rendez-vous?'
              : 'Okay. Would you like to confirm or cancel your appointment?'),
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
      return {
        response: this.truncateToMaxSentences(cleaned, 2),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CANCEL',
      };
    }

    // pendingAction === null: NEVER finalize without asking "Are you sure?" first
    if (hasConfirmSignal) {
      return {
        response: this.buildDoubleConfirmPrompt('CONFIRM', ctx, appointmentDate, isFrench),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CONFIRM',
      };
    }
    if (hasCancelSignal) {
      return {
        response: this.buildDoubleConfirmPrompt('CANCEL', ctx, appointmentDate, isFrench),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CANCEL',
      };
    }

    return {
      response: this.truncateToMaxSentences(cleaned, 2),
      isComplete: false,
      actionResult: null,
      nextPendingAction: null,
    };
  }

  private stripAllMarkers(text: string): string {
    const markers = [
      CALL_COMPLETE_MARKER,
      SLOT_CONFIRMED_MARKER,
      SLOT_CANCELLED_MARKER,
      INTENT_CONFIRM_MARKER,
      INTENT_CANCEL_MARKER,
      INTENT_YES_MARKER,
      INTENT_NO_MARKER,
    ];
    let result = text;
    for (const marker of markers) {
      result = result.replace(
        new RegExp(marker.replace(/[[\]]/g, '\\$&'), 'g'),
        '',
      );
    }
    return result.trim();
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
