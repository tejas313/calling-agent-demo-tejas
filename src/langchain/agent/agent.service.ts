import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
} from '../../common';
import { PatientsService } from '../../patients/patients.service';
import { LangsmithService } from '../../langsmith/langsmith.service';
import {
  buildSystemPrompt,
  CALL_COMPLETE_MARKER,
  INTENT_CALL_LATER_MARKER,
  INTENT_CANCEL_MARKER,
  INTENT_CONFIRM_MARKER,
  INTENT_NO_MARKER,
  INTENT_RESCHEDULE_MARKER,
  INTENT_YES_MARKER,
  PromptContext,
  SLOT_CANCELLED_MARKER,
  SLOT_CONFIRMED_MARKER,
} from '../prompts/system.prompt';
import { CallActionResult, createCallAgentGraph } from '../graph/call-agent.graph';

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
  actionResult: CallActionResult;
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

type FastIntent = 'CONFIRM' | 'CANCEL' | 'YES' | 'NO' | 'RESCHEDULE' | 'CALL_LATER' | null;

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
    @InjectDataSource()
    private readonly dataSource?: DataSource,
  ) {}

  private async rawQuery<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (this.dataSource && typeof this.dataSource.query === 'function') {
      return this.dataSource.query(sql, params);
    }
    throw new Error('No database connection available for raw query');
  }

  private async findClinicById(id: string): Promise<Clinic | null> {
    const sql = `
      SELECT
        id,
        name,
        "contactEmail",
        "contactPhone",
        address,
        "logoUrl",
        status,
        "isActive",
        "isDeleted",
        "createdAt",
        "updatedAt",
        "deletedAt"
      FROM clinics
      WHERE id = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<Clinic[]>(sql, [id]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  private async findPhysicianById(id: string): Promise<PhysicianClinicProfile | null> {
    const sql = `
      SELECT
        id,
        "firstName",
        "lastName",
        bio,
        "profilePictureUrl",
        phone,
        status,
        invited_by_user_id AS "invitedByUserId",
        "expiresAt",
        "isOnboardingComplete",
        user_id AS "userId",
        clinic_id AS "clinicId",
        "languageType",
        "createdAt",
        "updatedAt"
      FROM physician_clinic_profiles
      WHERE id = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<PhysicianClinicProfile[]>(sql, [id]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  private async findSlotById(id: string): Promise<PhysicianPatientSlot | null> {
    const sql = `
      SELECT
        id,
        office_availability_id AS "officeAvailabilityId",
        physician_profile_id AS "physicianProfileId",
        clinic_id AS "clinicId",
        physician_apt_type_id AS "physicianAptTypeId",
        TO_CHAR(date, 'YYYY-MM-DD') AS date,
        "startTime",
        "endTime",
        mode,
        status,
        "createdAt",
        "updatedAt"
      FROM physician_patient_slots
      WHERE id = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<PhysicianPatientSlot[]>(sql, [id]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  private async findAssignmentById(id: string): Promise<TriageAssignment | null> {
    const sql = `
      SELECT
        id,
        status,
        "chiefComplaint",
        priority,
        "declineReason",
        clinic_id AS "clinicId",
        patient_id AS "patientId",
        assigned_physician_id AS "assignedPhysicianId",
        "referralId",
        "referredBy",
        "referredSource",
        "referralDate",
        "activityStep",
        "isTriageApproved",
        "documentUrl",
        "approvedDate",
        "scheduleType",
        "scheduleCount",
        "scheduleUnit",
        appointment_type_id AS "appointmentTypeId",
        "createdAt",
        "updatedAt"
      FROM triage_assignments
      WHERE id = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<TriageAssignment[]>(sql, [id]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  private async findSpecialtiesByPhysicianId(
    physicianClinicProfileId: string,
  ): Promise<Array<{ specialty?: { name: string } }>> {
    const sql = `
      SELECT
        pcs.id,
        pcs.physician_clinic_profile_id AS "physicianClinicProfileId",
        pcs.specialty_id AS "specialtyId",
        s.id AS "s_id",
        s.name AS "s_name"
      FROM physician_clinic_specialties pcs
      LEFT JOIN specialties s ON s.id = pcs.specialty_id
      WHERE pcs.physician_clinic_profile_id = $1
    `;
    const rows = (await this.rawQuery<any[]>(sql, [physicianClinicProfileId])) || [];
    return rows.map((r) => ({
      specialty: r.s_name ? { name: r.s_name } : undefined,
    }));
  }

  private async findOfficeAvailabilityById(
    id: string,
  ): Promise<{ office?: { name?: string; address?: string; phone?: string } } | null> {
    const sql = `
      SELECT
        oa.id,
        TO_CHAR(oa.date, 'YYYY-MM-DD') AS date,
        oa."slotName",
        oa."startTime",
        oa."endTime",
        oa."isEnabled",
        oa."isOfficeNotAvailable",
        oa.office_id AS "officeId",
        oa.clinic_id AS "clinicId",
        o.id AS "o_id",
        o.name AS "o_name",
        o.address AS "o_address",
        o.phone AS "o_phone"
      FROM office_availability oa
      LEFT JOIN offices o ON o.id = oa.office_id
      WHERE oa.id = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<any[]>(sql, [id]);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      office: r.o_id
        ? {
            name: r.o_name,
            address: r.o_address,
            phone: r.o_phone,
          }
        : undefined,
    };
  }

  private async findAppointmentTypeById(
    id: string,
  ): Promise<{
    customName?: string | null;
    durationMinutes?: number;
    mode?: number;
    consultationType?: { name: string } | null;
    specialty?: { name: string } | null;
  } | null> {
    const sql = `
      SELECT
        pat.id,
        pat.custom_name AS "customName",
        pat.is_physician_custom AS "isPhysicianCustom",
        pat.priority,
        pat.max_per_day AS "maxPerDay",
        pat.duration_minutes AS "durationMinutes",
        pat.mode,
        pat.allow_overbook AS "allowOverbook",
        pat.is_active AS "isActive",
        pat.specialty_id AS "specialtyId",
        pat.consultation_type_id AS "consultationTypeId",
        ct.id AS "ct_id",
        ct.name AS "ct_name",
        s.id AS "s_id",
        s.name AS "s_name"
      FROM physician_appointment_types pat
      LEFT JOIN consultation_types ct ON ct.id = pat.consultation_type_id
      LEFT JOIN specialties s ON s.id = pat.specialty_id
      WHERE pat.id = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<any[]>(sql, [id]);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      customName: r.customName,
      durationMinutes: r.durationMinutes,
      mode: r.mode,
      consultationType: r.ct_name ? { name: r.ct_name } : null,
      specialty: r.s_name ? { name: r.s_name } : null,
    };
  }

  public getActiveModelName(): string {
    const configuredModel = this.configService.get<string>('GEMINI_MODEL');
    return configuredModel &&
      !configuredModel.includes('3.8') &&
      !configuredModel.includes('2.0') &&
      !configuredModel.includes('3.0') &&
      !configuredModel.includes('1.5')
      ? configuredModel
      : 'gemini-3.5-flash-lite';
  }

  private createModel() {
    try {
      const activeModel = this.getActiveModelName();

      return new ChatGoogleGenerativeAI({
        apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
        model: activeModel,
        temperature: 0.55,
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

      const loadFromDb = async (): Promise<CachedCallContext> => {
        const [patientRes, clinicRes, physicianRes, slotRes, assignmentRes, specialtiesRes] =
      await Promise.all([
        params.patientId
          ? this.patientsService.findById(params.patientId).catch(() => null)
          : Promise.resolve(null),
        params.clinicId
          ? this.findClinicById(params.clinicId).catch(() => null)
          : Promise.resolve(null),
        params.assignedPhysicianId
          ? this.findPhysicianById(params.assignedPhysicianId).catch(() => null)
          : Promise.resolve(null),
        params.slotId
          ? this.findSlotById(params.slotId).catch(() => null)
          : Promise.resolve(null),
        params.assignmentsId
          ? this.findAssignmentById(params.assignmentsId).catch(() => null)
          : Promise.resolve(null),
        params.assignedPhysicianId
          ? this.findSpecialtiesByPhysicianId(params.assignedPhysicianId).catch(() => [])
          : Promise.resolve([]),
      ]);

    const [officeAvailRes, aptTypeRes] = await Promise.all([
      slotRes?.officeAvailabilityId
        ? this.findOfficeAvailabilityById(slotRes.officeAvailabilityId).catch(() => null)
        : Promise.resolve(null),
      slotRes?.physicianAptTypeId || assignmentRes?.appointmentTypeId
        ? this.findAppointmentTypeById(
            (slotRes?.physicianAptTypeId || assignmentRes?.appointmentTypeId) as string,
          ).catch(() => null)
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
      };

      if (this.langsmithService?.traceRun) {
        return await this.langsmithService.traceRun(
          {
            name: 'db-context-load',
            runType: 'retriever',
            inputs: {
              callId: params.callId,
              patientId: params.patientId,
              clinicId: params.clinicId,
              slotId: params.slotId || null,
            },
            metadata: {
              thread_id: params.callId,
              session_id: params.callId,
              callId: params.callId,
            },
            tags: ['db-context', 'cache-miss'],
            processOutputs: (out) => ({
              patientLoaded: Boolean(out.patientName),
              clinicLoaded: Boolean(out.clinicName),
              physicianLoaded: Boolean(out.physicianName),
              slotLoaded: Boolean(out.slotDateRaw),
            }),
          },
          loadFromDb,
        );
      }

      return await loadFromDb();
    } catch (error: any) {
      this.logger.error(`Error in getOrLoadContext for callId=${params.callId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  private parseSlotTimeParts(timeStr: string): { hour24: number; minutes: number } | null {
    if (!timeStr) return null;
    const trimmed = timeStr.trim().toUpperCase();
    const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (ampmMatch) {
      let hour24 = parseInt(ampmMatch[1], 10);
      const minutes = parseInt(ampmMatch[2], 10);
      const meridiem = ampmMatch[3];
      if (meridiem === 'PM' && hour24 !== 12) hour24 += 12;
      if (meridiem === 'AM' && hour24 === 12) hour24 = 0;
      return { hour24, minutes };
    }
    const h24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) {
      return {
        hour24: parseInt(h24Match[1], 10),
        minutes: parseInt(h24Match[2], 10),
      };
    }
    return null;
  }

  private formatOrdinalDay(day: number): string {
    const mod100 = day % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
    switch (day % 10) {
      case 1:
        return `${day}st`;
      case 2:
        return `${day}nd`;
      case 3:
        return `${day}rd`;
      default:
        return `${day}th`;
    }
  }

  private formatSlotForLanguage(ctx: CachedCallContext, language: string): string {
    if (!ctx.slotDateRaw || !ctx.slotStartTime) {
      return '';
    }
    const isFrench = language === 'fr';
    const slotMoment = dayjs(ctx.slotDateRaw);
    const sameYear = slotMoment.year() === dayjs().year();
    const formattedDate = isFrench
      ? slotMoment.locale('fr').format(sameYear ? 'dddd D MMMM' : 'dddd D MMMM YYYY')
      : sameYear
        ? `${slotMoment.format('dddd, MMMM')} ${this.formatOrdinalDay(slotMoment.date())}`
        : `${slotMoment.format('dddd, MMMM')} ${this.formatOrdinalDay(slotMoment.date())}, ${slotMoment.year()}`;

    let formattedTime = ctx.slotStartTime;
    const timeParts = this.parseSlotTimeParts(ctx.slotStartTime);
    if (timeParts) {
      const { hour24, minutes } = timeParts;
      const minsPadded = String(minutes).padStart(2, '0');
      if (isFrench) {
        const hourWord = hour24 === 1 ? '1 heure' : `${hour24} heures`;
        formattedTime = minutes === 0 ? hourWord : `${hourWord} ${minsPadded}`;
      } else {
        const period = hour24 >= 12 ? 'PM' : 'AM';
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
        formattedTime = minutes === 0 ? `${hour12} ${period}` : `${hour12}:${minsPadded} ${period}`;
      }
    }

    return isFrench
      ? `${formattedDate} à ${formattedTime}`
      : `${formattedDate}, at ${formattedTime}`;
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
    const turnStartMs = Date.now();
    try {
      const isFrench = params.language === 'fr';
      const activeModel = this.getActiveModelName();
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
      this.logger.log(
        `[runAgentTurn] 📥 User input message: "${params.userMessage}" (pendingAction=${params.pendingAction ?? 'none'})`,
      );

      const traceMetadata = this.langsmithService?.getMetadata?.({
        clinicId: params.clinicId,
        patientId: params.patientId,
        appointmentId: params.slotId || '',
        callId: params.callId,
        twilioCallSid: params.twilioCallSid,
        language: params.language,
        callType: params.callType,
        model: activeModel,
        pendingAction: params.pendingAction ?? null,
      }) ?? { thread_id: params.callId, callId: params.callId, model: activeModel };

      const traceTags = this.langsmithService?.getTags?.({
        language: params.language,
        callType: params.callType,
        clinicId: params.clinicId,
      }) ?? ['ai-call'];

      const runWithTrace = <TInput extends Record<string, any>, TOutput>(
        name: string,
        inputs: TInput,
        fn: (inp: TInput) => Promise<TOutput>,
        processOutputs?: (outputs: Readonly<Record<string, any>>) => Record<string, any>,
        extraTags: string[] = [],
      ): Promise<TOutput> => {
        if (this.langsmithService?.traceRun) {
          return this.langsmithService.traceRun(
            {
              name,
              runType: 'chain',
              inputs,
              metadata: traceMetadata,
              tags: [...traceTags, ...extraTags],
              processOutputs,
            },
            fn,
          );
        }
        return fn(inputs);
      };

      const turnInputs = {
        callId: params.callId,
        userMessage: params.userMessage,
        language: params.language,
        callType: params.callType,
        pendingAction: params.pendingAction ?? null,
        historyLength: params.conversationHistory.length,
        patientName: ctx.patientName,
        clinicName: ctx.clinicName,
        physicianName: ctx.physicianName,
        appointmentDate,
      };

      return await runWithTrace(
        'ai-call-agent-turn',
        turnInputs,
        async () => {
          const graph = createCallAgentGraph({
            buildGreeting: (french) =>
              runWithTrace(
                'fast-path-greeting',
                {
                  callId: params.callId,
                  language: params.language,
                  patientName: ctx.patientName,
                  clinicName: ctx.clinicName,
                  physicianName: ctx.physicianName,
                  appointmentDate,
                },
                async () => {
                  const greeting = this.buildTurn2Greeting(ctx, appointmentDate, french);
                  this.logger.log(`[runAgentTurn] 🎙️ Fast Turn 2 greeting: "${greeting}"`);
                  return greeting;
                },
                (greeting) => ({
                  response: greeting,
                  intentPath: 'FAST_PATH',
                  isComplete: false,
                }),
                ['fast-path', 'greeting'],
              ),
            normalizeStt: (msg, pending) => {
              const normalized = this.normalizeTelephonyStt(msg, pending);
              if (normalized !== msg) {
                this.logger.log(
                  `[runAgentTurn] 🔧 STT normalized: "${msg}" -> "${normalized}"`,
                );
              }
              return normalized;
            },
            tryFastTransition: (normalizedMsg, pending, french) => {
              const decision = this.tryFastStateTransition(
                normalizedMsg,
                pending,
                ctx,
                appointmentDate,
                french,
              );
              if (!decision) return null;
              return runWithTrace(
                'fast-path-transition',
                {
                  userMessage: params.userMessage,
                  normalizedUserMessage: normalizedMsg,
                  pendingAction: pending,
                },
                async () => {
                  this.logger.log(
                    `[runAgentTurn] ⚡ Fast-path transition: pending=${pending ?? 'null'} -> next=${decision.nextPendingAction ?? 'null'}, action=${decision.actionResult ?? 'none'} | 🗣️ Response: "${decision.response}"`,
                  );
                  return decision;
                },
                (out) => ({
                  response: out.response,
                  intentPath: 'FAST_PATH',
                  isComplete: out.isComplete,
                  actionResult: out.actionResult,
                  nextPendingAction: out.nextPendingAction,
                }),
                [
                  'fast-path',
                  decision.actionResult
                    ? decision.actionResult.toLowerCase()
                    : 'transition',
                ],
              );
            },
            invokeLlm: async (normalizedMsg, history) => {
              const model = this.createModel();
              const promptCtx = this.buildPromptContext(ctx, params, appointmentDate);
              const systemPrompt = buildSystemPrompt(promptCtx);
              const messages = [
                new SystemMessage(systemPrompt),
                ...history,
                new HumanMessage(normalizedMsg),
              ];

              let responseText = '';
              let llmError: string | undefined;
              try {
                const responseMessage = await Promise.race([
                  model.invoke(messages, {
                    runName: 'gemini-call-agent',
                    tags: [...traceTags, 'llm-path'],
                    metadata: traceMetadata,
                  }),
                  new Promise<never>((_, reject) =>
                    setTimeout(
                      () =>
                        reject(
                          new Error('LLM_TIMEOUT: Model took longer than 7 seconds'),
                        ),
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

              responseText =
                typeof responseText === 'string'
                  ? responseText
                  : String(responseText || '');
              this.logger.log(
                `[runAgentTurn] Raw LLM response: "${responseText.substring(0, 200)}"`,
              );
              return { rawText: responseText, llmError };
            },
            enforceStateMachine: (rawText, pending, french) =>
              this.enforceStateMachineOnLlmOutput(
                rawText,
                pending,
                ctx,
                appointmentDate,
                french,
              ),
          });

          const finalState = await graph.invoke(
            {
              callId: params.callId,
              language: params.language,
              isFrench,
              userMessage: params.userMessage,
              normalizedUserMessage: params.userMessage,
              conversationHistory: params.conversationHistory,
              pendingAction: params.pendingAction ?? null,
              sttHints,
              intentPath: 'LLM',
              fastDecision: null,
              rawLlmResponse: '',
              response: '',
              isComplete: false,
              actionResult: null,
              nextPendingAction: null,
              llmError: undefined,
              updatedHistory: params.conversationHistory,
            },
            {
              runName: 'langgraph-call-agent',
              tags: [...traceTags, 'langgraph'],
              metadata: traceMetadata,
            },
          );

          const finalResult = {
            response: finalState.response,
            isComplete: finalState.isComplete,
            actionResult: finalState.actionResult,
            nextPendingAction: finalState.nextPendingAction,
            intentPath: finalState.intentPath,
            normalizedUserMessage:
              params.userMessage === 'LANGUAGE_SELECTED'
                ? undefined
                : finalState.normalizedUserMessage,
            sttHints,
            llmError: finalState.llmError,
            updatedHistory: finalState.updatedHistory,
            toolsUsed: [],
          };

          this.logger.log(
            `[runAgentTurn] 🤖 Agent Spoke (${finalResult.intentPath}): "${finalResult.response}" (action=${finalResult.actionResult ?? 'none'}, complete=${finalResult.isComplete})`,
          );

          return finalResult;
        },
        (out) => ({
          response: out.response,
          intentPath: out.intentPath,
          modelUsed: out.intentPath === 'LLM' ? activeModel : 'none (fast-path)',
          turnDurationMs: Date.now() - turnStartMs,
          isComplete: out.isComplete,
          actionResult: out.actionResult,
          nextPendingAction: out.nextPendingAction,
          llmError: out.llmError ?? null,
        }),
      );
    } catch (error: any) {
      this.logger.error(
        `[runAgentTurn] ❌ FATAL ERROR for callId=${params.callId}: ${error?.message}`,
      );
      throw error;
    }
  }

  private formatFirstName(name?: string): string {
    if (!name) return '';
    const first = name.trim().split(/\s+/)[0];
    if (!first) return '';
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }

  private buildTurn2Greeting(
    ctx: CachedCallContext,
    appointmentDate: string,
    isFrench: boolean,
  ): string {
    const displaySlot =
      appointmentDate ||
      (isFrench ? 'votre prochain créneau disponible' : 'your upcoming available slot');
    const firstName = this.formatFirstName(ctx.patientName);
    const displayName = firstName ? ` ${firstName}` : '';
    const displayClinic =
      ctx.clinicName || (isFrench ? 'la clinique médicale' : 'the medical clinic');
    const displayPhysician = ctx.physicianName
      ? isFrench
        ? ` avec Docteur ${ctx.physicianName}`
        : ` with Dr. ${ctx.physicianName}`
      : '';

    return isFrench
      ? `Bonjour${displayName}, ici ${displayClinic}. Nous avons un créneau disponible${displayPhysician} le ${displaySlot}. Souhaitez-vous confirmer ce rendez-vous ou l'annuler?`
      : `Hi${displayName}, this is ${displayClinic} calling. We have an appointment slot available${displayPhysician} on ${displaySlot}. Would you like to confirm this appointment, or would you prefer to cancel?`;
  }

  private buildDoubleConfirmPrompt(
    action: 'CONFIRM' | 'CANCEL',
    ctx: CachedCallContext,
    appointmentDate: string,
    isFrench: boolean,
  ): string {
    const physicianPhrase = ctx.physicianName
      ? isFrench
        ? ` avec Docteur ${ctx.physicianName}`
        : ` with Doctor ${ctx.physicianName}`
      : '';
    const slotPhrase = appointmentDate
      ? isFrench
        ? ` le ${appointmentDate}`
        : ` on ${appointmentDate}`
      : '';

    if (action === 'CONFIRM') {
      return isFrench
        ? `Êtes-vous sûr de vouloir confirmer votre rendez-vous${physicianPhrase}${slotPhrase}?`
        : `Are you sure you want to confirm your appointment${physicianPhrase}${slotPhrase}?`;
    }

    return isFrench
      ? `Êtes-vous sûr de vouloir annuler votre rendez-vous${physicianPhrase}${slotPhrase}?`
      : `Are you sure you want to cancel your appointment${physicianPhrase}${slotPhrase}?`;
  }

  private buildClarifyIntentPrompt(isFrench: boolean): string {
    return isFrench
      ? `Souhaitez-vous confirmer ce rendez-vous ou l'annuler?`
      : `Would you like to confirm this appointment, or do you need to cancel it?`;
  }

  private buildRescheduleMessage(ctx: CachedCallContext, isFrench: boolean): string {
    const clinic = ctx.clinicName || (isFrench ? 'notre clinique' : 'our clinic');
    const phone = ctx.clinicPhone || ctx.officePhone;
    const phonePhrase = phone
      ? isFrench
        ? ` au ${phone}`
        : ` at ${phone}`
      : '';

    return isFrench
      ? `Comme je peux uniquement confirmer ou annuler ce créneau, veuillez appeler ${clinic}${phonePhrase} pour choisir une autre date ou heure. Bonne journée!`
      : `Since I can only confirm or cancel this scheduled slot, please call ${clinic}${phonePhrase} to arrange a different date or time. Have a wonderful day!`;
  }

  private buildCallLaterMessage(ctx: CachedCallContext, isFrench: boolean): string {
    const clinic = ctx.clinicName || (isFrench ? 'notre clinique' : 'our clinic');
    const phone = ctx.clinicPhone || ctx.officePhone;
    const phonePhrase = phone
      ? isFrench
        ? ` au ${phone}`
        : ` at ${phone}`
      : '';

    return isFrench
      ? `Nous essaierons de vous rappeler plus tard, ou vous pouvez appeler ${clinic}${phonePhrase} quand cela vous convient. Bonne journée!`
      : `We will try reaching you another time, or you can call ${clinic}${phonePhrase} whenever it is convenient. Take care!`;
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
        ? `Votre rendez-vous est bien confirmé pour le ${slotText}. Merci beaucoup et passez une très belle journée!`
        : `Your appointment is confirmed for ${slotText}. Thanks so much for your time, and have a wonderful day!`;
    }

    return isFrench
      ? `J'ai bien annulé votre rendez-vous du ${slotText}. N'hésitez pas à rappeler ${clinic} si vous avez besoin d'autre chose. Bonne journée!`
      : `I've cancelled your appointment for ${slotText}. Feel free to reach out to ${clinic} anytime if you need anything else. Take care!`;
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
    if (wordCount === 0 || wordCount > 10) {
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

    // Common STT substitutions for "confirm" on narrowband 8kHz phone audio.
    // Guard against callback/clinic contact phrases ("Please contact me later", "Contact the clinic").
    const isCallbackOrContactPhrase =
      /\b(me|us|later|back|call|phone|clinic|office|doctor|someone|reception)\b/i.test(lower);
    const confirmHomophoneRegex = /\b(contact|confer|conform|conformed|conforming|corn firm|come firm|confim|con firm|can firm)\b/gi;
    const hasConfirmContext =
      pendingAction === 'CONFIRM' ||
      /\b(yes|yeah|yep|please|appointment|it|this|my)\b/i.test(lower) ||
      wordCount <= 2;
    if (!isCallbackOrContactPhrase && hasConfirmContext && confirmHomophoneRegex.test(repaired)) {
      repaired = repaired.replace(confirmHomophoneRegex, 'confirm');
    }

    // Common STT substitutions for "cancel"
    const cancelHomophoneRegex = /\b(counsel|council|cansel|pencil|can sell)\b/gi;
    if (cancelHomophoneRegex.test(repaired)) {
      repaired = repaired.replace(cancelHomophoneRegex, 'cancel');
    }

    // Common STT word-split for "appointment"
    repaired = repaired.replace(/\b(a point mint|appoint ment)\b/gi, 'appointment');

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

    // If the utterance asks an informational question or requests details, route to LLM
    const infoQuestionSignals = [
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
    if (infoQuestionSignals.some((sig) => text.toLowerCase().includes(sig))) {
      return null;
    }

    const words = normalized.split(' ');
    if (words.length > 9) {
      return null;
    }

    // Guard against negated actions (e.g. "no don't cancel", "do not confirm")
    const hasNegatedCancel =
      /\b(don't|do not|never|not|ne\s+pas|pas)\s+(?:want\s+to\s+|need\s+to\s+|please\s+)?(cancel|annuler)\b/.test(
        normalized,
      );
    const hasNegatedConfirm =
      /\b(don't|do not|never|not|ne\s+pas|pas)\s+(?:want\s+to\s+|need\s+to\s+|please\s+)?(confirm|book|confirmer|réserver)\b/.test(
        normalized,
      );
    if (hasNegatedCancel || hasNegatedConfirm) {
      return 'NO';
    }

    const hasCallLater =
      /\b(call me later|call me back|call back later|call back|call later|contact me later|contact later|reach me later|busy right now|in a meeting|driving|not a good time|rappeler plus tard|rappelez plus tard|recontacter plus tard|pas le bon moment)\b/.test(
        normalized,
      );
    if (hasCallLater) return 'CALL_LATER';

    const hasReschedule =
      /\b(reschedule|another day|another time|different day|different time|different date|move my appointment|change the date|change the time|reporter|reprogrammer|autre jour|autre heure|changer la date)\b/.test(
        normalized,
      );
    if (hasReschedule) return 'RESCHEDULE';

    if (text.includes('?')) {
      return null;
    }

    const hasAlternativeDayOrTime =
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+week|morning|afternoon|evening|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|semaine\s+prochaine|matin|après-midi|soir)\b/.test(
        normalized,
      );

    const hasCancel =
      /\b(cancel|cancelled|canceled|cancelling|annuler|annulez|annule|annulation)\b/.test(
        normalized,
      ) ||
      /\b(don't want|do not want|cannot make|can't make|not coming|skip it)\b/.test(
        normalized,
      );

    const hasConfirm =
      !hasAlternativeDayOrTime &&
      (/\b(confirm|confirmed|confirming|book|book it|confirmer|confirme|confirmez|réserver)\b/.test(
        normalized,
      ) ||
        (pendingAction === null &&
          /\b(sounds good|that works|works for me|i'll be there|i will be there|see you then|ça marche|ça me va|c'est bon pour moi)\b/.test(
            normalized,
          )));

    // Avoid ambiguity if both appear in one utterance
    if (hasCancel && hasConfirm) {
      return null;
    }
    if (hasCancel) return 'CANCEL';
    if (hasConfirm) return 'CONFIRM';

    const isYes =
      /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|of course|definitely|absolutely|correct|right|i am sure|yes please|yes i am|please do|confirm it|sounds good|oui|ouais|d'accord|daccord|bien sûr|parfait|volontiers|allez-y|c'est ça)(\s+(please|sure|i am|it|that|s'il vous plaît|merci))?$/.test(
        normalized,
      );
    if (isYes) return 'YES';

    // During pending double-confirmation, any short affirmative opening without a negation is YES
    if (
      pendingAction !== null &&
      /^(yes|yeah|yep|sure|ok|okay|correct|right|go ahead|oui|d'accord|daccord|allez-y)\b/.test(
        normalized,
      ) &&
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

    if (intent === 'CALL_LATER') {
      return {
        response: this.buildCallLaterMessage(ctx, isFrench),
        isComplete: true,
        actionResult: 'CALL_LATER',
        nextPendingAction: null,
      };
    }

    if (intent === 'RESCHEDULE') {
      return {
        response: this.buildRescheduleMessage(ctx, isFrench),
        isComplete: true,
        actionResult: 'RESCHEDULED',
        nextPendingAction: null,
      };
    }

    if (pendingAction === 'CONFIRM') {
      if (intent === 'CANCEL') {
        // Switching intent mid-flow still requires explicit cross-verification for the new action
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
            ? "Je ne confirme pas encore ce rendez-vous. Souhaitez-vous l'annuler ou avez-vous une question?"
            : "I haven't confirmed it yet. Would you like to cancel this appointment, or do you have a question?",
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
    }

    if (pendingAction === 'CANCEL') {
      if (intent === 'CONFIRM') {
        // Switching intent mid-flow still requires explicit cross-verification for the new action
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
            ? "Le rendez-vous n'est pas annulé. Souhaitez-vous le confirmer ou avez-vous une question?"
            : "I haven't cancelled it. Would you like to confirm the appointment, or do you have a question?",
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
    }

    // pendingAction === null: mandatory cross-verification before executing CONFIRM or CANCEL
    if (intent === 'CONFIRM') {
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

    if (intent === 'YES') {
      // Bare "yes" after "confirm or cancel?" is ambiguous — clarify instead of guessing
      return {
        response: this.buildClarifyIntentPrompt(isFrench),
        isComplete: false,
        actionResult: null,
        nextPendingAction: null,
      };
    }

    if (intent === 'NO') {
      return {
        response: isFrench
          ? "Souhaitez-vous annuler ce rendez-vous ou avez-vous une question concernant la clinique ou le médecin?"
          : 'Would you like to cancel this appointment, or do you have a question about the clinic or physician?',
        isComplete: false,
        actionResult: null,
        nextPendingAction: null,
      };
    }

    return null;
  }

  private mergeAnswerWithPrompt(answer: string, followUpPrompt: string): string {
    const declarativeSentences = this.extractDeclarativeSentences(answer, 2);
    if (!declarativeSentences) {
      return followUpPrompt;
    }
    return `${declarativeSentences} ${followUpPrompt}`.trim();
  }

  private extractDeclarativeSentences(text: string, maxSentences: number = 2): string {
    if (!text) return '';
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s|$)/g;
    const kept: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (!sentence.endsWith('?')) {
        kept.push(sentence);
      }
      if (kept.length >= maxSentences) break;
    }
    return kept.join(' ').trim();
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
    const hasRescheduleSignal = rawText.includes(INTENT_RESCHEDULE_MARKER);
    const hasCallLaterSignal = rawText.includes(INTENT_CALL_LATER_MARKER);

    const cleaned = this.stripAllMarkers(rawText);

    if (hasCallLaterSignal) {
      return {
        response: this.buildCallLaterMessage(ctx, isFrench),
        isComplete: true,
        actionResult: 'CALL_LATER',
        nextPendingAction: null,
      };
    }

    if (hasRescheduleSignal) {
      return {
        response: this.buildRescheduleMessage(ctx, isFrench),
        isComplete: true,
        actionResult: 'RESCHEDULED',
        nextPendingAction: null,
      };
    }

    if (pendingAction === 'CONFIRM') {
      if (hasCancelSignal) {
        return {
          response: this.mergeAnswerWithPrompt(
            cleaned,
            this.buildDoubleConfirmPrompt('CANCEL', ctx, appointmentDate, isFrench),
          ),
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
              ? 'Souhaitez-vous confirmer ou annuler le rendez-vous?'
              : 'Would you like to confirm or cancel your appointment?'),
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
      // Question answered while pending confirmation — preserve declarative answer and always keep verification reminder
      const reminder = isFrench
        ? 'Êtes-vous sûr de vouloir confirmer votre rendez-vous?'
        : 'Are you sure you want to confirm your appointment?';
      return {
        response: this.mergeAnswerWithPrompt(cleaned, reminder),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CONFIRM',
      };
    }

    if (pendingAction === 'CANCEL') {
      if (hasConfirmSignal) {
        return {
          response: this.mergeAnswerWithPrompt(
            cleaned,
            this.buildDoubleConfirmPrompt('CONFIRM', ctx, appointmentDate, isFrench),
          ),
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
              ? 'Souhaitez-vous confirmer ou annuler le rendez-vous?'
              : 'Would you like to confirm or cancel your appointment?'),
          isComplete: false,
          actionResult: null,
          nextPendingAction: null,
        };
      }
      // Question answered while pending cancellation — preserve declarative answer and always keep verification reminder
      const reminder = isFrench
        ? 'Êtes-vous sûr de vouloir annuler votre rendez-vous?'
        : 'Are you sure you want to cancel your appointment?';
      return {
        response: this.mergeAnswerWithPrompt(cleaned, reminder),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CANCEL',
      };
    }

    // pendingAction === null: mandatory cross-verification before executing CONFIRM or CANCEL
    if (hasConfirmSignal) {
      return {
        response: this.mergeAnswerWithPrompt(
          cleaned,
          this.buildDoubleConfirmPrompt('CONFIRM', ctx, appointmentDate, isFrench),
        ),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CONFIRM',
      };
    }
    if (hasCancelSignal) {
      return {
        response: this.mergeAnswerWithPrompt(
          cleaned,
          this.buildDoubleConfirmPrompt('CANCEL', ctx, appointmentDate, isFrench),
        ),
        isComplete: false,
        actionResult: null,
        nextPendingAction: 'CANCEL',
      };
    }

    return {
      response: this.truncateToMaxSentences(cleaned, 3),
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
      INTENT_RESCHEDULE_MARKER,
      INTENT_CALL_LATER_MARKER,
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

  private truncateToMaxSentences(text: string, maxSentences: number = 3): string {
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
