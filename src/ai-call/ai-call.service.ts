import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dayjs: typeof import('dayjs') = require('dayjs');
import {
  AiCall,
  AiCallLog,
  AiCallLogLevel,
  ConversationMessage,
  PatientAppointmentBooking,
  PatientProfile,
  PhysicianClinicProfile,
  PhysicianPatientSlot,
  TriageAssignment,
} from '../common';
import { StartCallDto } from './dto/start-call.dto';
import { StartCallByPhoneDto } from './dto/start-call-by-phone.dto';
import { TwilioService } from '../twilio/twilio.service';
import { AgentService } from '../langchain/agent/agent.service';
import { LangsmithService } from '../langsmith/langsmith.service';
import { CallStatus, CallOutcome, CallType, MAX_CALL_TURNS, MAX_NO_INPUT_RETRIES } from '../common/constants';

@Injectable()
export class AiCallService {
  private readonly logger = new Logger(AiCallService.name);
  private readonly pendingResponses = new Map<string, string | null>();
  private readonly noInputRetryCounts = new Map<string, number>();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly twilioService?: TwilioService,
    private readonly agentService?: AgentService,
    private readonly configService?: ConfigService,
    @Optional()
    private readonly langsmithService?: LangsmithService,
  ) {}

  private traceCallMilestone<TInput extends Record<string, any>, TOutput>(
    aiCall: AiCall,
    name: string,
    runType: 'chain' | 'tool' | 'retriever',
    inputs: TInput,
    fn: () => Promise<TOutput>,
    extraTags: string[] = [],
  ): Promise<TOutput> {
    if (!this.langsmithService?.traceRun) {
      return fn();
    }
    const metadata = this.langsmithService.getMetadata({
      clinicId: aiCall.clinicId,
      patientId: aiCall.patientId,
      appointmentId: aiCall.slotId || '',
      callId: aiCall.id,
      twilioCallSid: aiCall.twilioCallSid || '',
      language: aiCall.language,
      callType: aiCall.callType,
      model: this.agentService?.getActiveModelName?.(),
    });
    const tags = [
      ...this.langsmithService.getTags({
        language: aiCall.language,
        callType: aiCall.callType,
        clinicId: aiCall.clinicId,
      }),
      ...extraTags,
    ];
    return this.langsmithService.traceRun(
      { name, runType, inputs, metadata, tags },
      () => fn(),
    );
  }

  private async rawQuery<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (this.dataSource && typeof this.dataSource.query === 'function') {
      return this.dataSource.query(sql, params);
    }
    throw new Error('No database connection available for raw query');
  }

  /**
   * Persists an audit/error log entry to ai_call_logs via raw SQL query without throwing.
   */
  private async logCallEvent(params: {
    callId?: string | null;
    twilioCallSid?: string | null;
    patientId?: string | null;
    assignmentsId?: string | null;
    eventType: string;
    level?: AiCallLogLevel;
    message: string;
    details?: Record<string, any> | null;
  }): Promise<void> {
    try {
      const sql = `
        INSERT INTO ai_call_logs (
          call_id,
          twilio_call_sid,
          patient_id,
          assignments_id,
          event_type,
          level,
          message,
          details
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
      `;
      const values = [
        params.callId ?? null,
        params.twilioCallSid ?? null,
        params.patientId ?? null,
        params.assignmentsId ?? null,
        params.eventType,
        params.level ?? 'INFO',
        params.message,
        params.details ? JSON.stringify(params.details) : null,
      ];
      await this.rawQuery(sql, values);
    } catch (err: any) {
      this.logger.warn(`[logCallEvent] Failed to persist log (${params.eventType}): ${err?.message}`);
    }
  }

  /**
   * Saves or updates an AiCall record via raw SQL query.
   */
  private async saveAiCall(aiCall: Partial<AiCall>): Promise<AiCall> {
    const transcriptJson = JSON.stringify(aiCall.transcript || []);
    const conversationHistoryJson = JSON.stringify(aiCall.conversationHistory || []);

    if (aiCall.id) {
      const sql = `
        UPDATE ai_calls SET
          patient_id = $1,
          clinic_id = $2,
          assignments_id = $3,
          assigned_physician_id = $4,
          slot_id = $5,
          appointment_id = $6,
          phone_number = $7,
          twilio_call_sid = $8,
          language = $9,
          call_type = $10,
          status = $11,
          outcome = $12,
          transcript = $13,
          conversation_history = $14,
          current_turn = $15,
          started_at = $16,
          ended_at = $17,
          duration = $18,
          pending_action = $19,
          call_reason = $20,
          last_error = $21,
          updated_at = NOW()
        WHERE id = $22
        RETURNING
          id,
          patient_id AS "patientId",
          assignments_id AS "assignmentsId",
          assigned_physician_id AS "assignedPhysicianId",
          slot_id AS "slotId",
          appointment_id AS "appointmentId",
          clinic_id AS "clinicId",
          phone_number AS "phoneNumber",
          twilio_call_sid AS "twilioCallSid",
          language,
          call_type AS "callType",
          status,
          outcome,
          transcript,
          conversation_history AS "conversationHistory",
          current_turn AS "currentTurn",
          started_at AS "startedAt",
          ended_at AS "endedAt",
          duration,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          pending_action AS "pendingAction",
          call_reason AS "callReason",
          last_error AS "lastError"
      `;
      const values = [
        aiCall.patientId,
        aiCall.clinicId,
        aiCall.assignmentsId ?? null,
        aiCall.assignedPhysicianId ?? null,
        aiCall.slotId ?? null,
        aiCall.appointmentId ?? null,
        aiCall.phoneNumber,
        aiCall.twilioCallSid ?? null,
        aiCall.language ?? 'en',
        aiCall.callType,
        aiCall.status,
        aiCall.outcome ?? null,
        transcriptJson,
        conversationHistoryJson,
        aiCall.currentTurn ?? 0,
        aiCall.startedAt ?? null,
        aiCall.endedAt ?? null,
        aiCall.duration ?? null,
        aiCall.pendingAction ?? null,
        aiCall.callReason ?? null,
        aiCall.lastError ?? null,
        aiCall.id,
      ];
      const rows = await this.rawQuery<AiCall[]>(sql, values);
      const updated = rows && rows.length > 0 ? rows[0] : (aiCall as AiCall);
      if (typeof updated.transcript === 'string') {
        try { updated.transcript = JSON.parse(updated.transcript); } catch { updated.transcript = []; }
      }
      if (typeof updated.conversationHistory === 'string') {
        try { updated.conversationHistory = JSON.parse(updated.conversationHistory); } catch { updated.conversationHistory = []; }
      }
      Object.assign(aiCall, updated);
      return aiCall as AiCall;
    } else {
      const sql = `
        INSERT INTO ai_calls (
          patient_id, clinic_id, assignments_id, assigned_physician_id,
          slot_id, appointment_id, phone_number, language, call_type,
          status, current_turn, pending_action, call_reason, transcript,
          conversation_history
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        ) RETURNING
          id,
          patient_id AS "patientId",
          assignments_id AS "assignmentsId",
          assigned_physician_id AS "assignedPhysicianId",
          slot_id AS "slotId",
          appointment_id AS "appointmentId",
          clinic_id AS "clinicId",
          phone_number AS "phoneNumber",
          twilio_call_sid AS "twilioCallSid",
          language,
          call_type AS "callType",
          status,
          outcome,
          transcript,
          conversation_history AS "conversationHistory",
          current_turn AS "currentTurn",
          started_at AS "startedAt",
          ended_at AS "endedAt",
          duration,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          pending_action AS "pendingAction",
          call_reason AS "callReason",
          last_error AS "lastError"
      `;
      const values = [
        aiCall.patientId,
        aiCall.clinicId,
        aiCall.assignmentsId ?? null,
        aiCall.assignedPhysicianId ?? null,
        aiCall.slotId ?? null,
        aiCall.appointmentId ?? null,
        aiCall.phoneNumber,
        aiCall.language ?? 'en',
        aiCall.callType,
        aiCall.status ?? CallStatus.INITIATED,
        aiCall.currentTurn ?? 0,
        aiCall.pendingAction ?? null,
        aiCall.callReason ?? null,
        transcriptJson,
        conversationHistoryJson,
      ];
      const rows = await this.rawQuery<AiCall[]>(sql, values);
      const created = rows && rows.length > 0 ? rows[0] : (aiCall as AiCall);
      if (typeof created.transcript === 'string') {
        try { created.transcript = JSON.parse(created.transcript); } catch { created.transcript = []; }
      }
      if (typeof created.conversationHistory === 'string') {
        try { created.conversationHistory = JSON.parse(created.conversationHistory); } catch { created.conversationHistory = []; }
      }
      Object.assign(aiCall, created);
      return aiCall as AiCall;
    }
  }

  private async findAiCallById(id: string): Promise<AiCall | null> {
    const sql = `
      SELECT
        id,
        patient_id AS "patientId",
        assignments_id AS "assignmentsId",
        assigned_physician_id AS "assignedPhysicianId",
        slot_id AS "slotId",
        appointment_id AS "appointmentId",
        clinic_id AS "clinicId",
        phone_number AS "phoneNumber",
        twilio_call_sid AS "twilioCallSid",
        language,
        call_type AS "callType",
        status,
        outcome,
        transcript,
        conversation_history AS "conversationHistory",
        current_turn AS "currentTurn",
        started_at AS "startedAt",
        ended_at AS "endedAt",
        duration,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        pending_action AS "pendingAction",
        call_reason AS "callReason",
        last_error AS "lastError"
      FROM ai_calls
      WHERE id = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<AiCall[]>(sql, [id]);
    if (!rows || rows.length === 0) return null;
    const call = rows[0];
    if (typeof call.transcript === 'string') {
      try { call.transcript = JSON.parse(call.transcript); } catch { call.transcript = []; }
    }
    if (typeof call.conversationHistory === 'string') {
      try { call.conversationHistory = JSON.parse(call.conversationHistory); } catch { call.conversationHistory = []; }
    }
    return call;
  }

  private async findAiCallByTwilioSid(sid: string): Promise<AiCall | null> {
    const sql = `
      SELECT
        id,
        patient_id AS "patientId",
        assignments_id AS "assignmentsId",
        assigned_physician_id AS "assignedPhysicianId",
        slot_id AS "slotId",
        appointment_id AS "appointmentId",
        clinic_id AS "clinicId",
        phone_number AS "phoneNumber",
        twilio_call_sid AS "twilioCallSid",
        language,
        call_type AS "callType",
        status,
        outcome,
        transcript,
        conversation_history AS "conversationHistory",
        current_turn AS "currentTurn",
        started_at AS "startedAt",
        ended_at AS "endedAt",
        duration,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        pending_action AS "pendingAction",
        call_reason AS "callReason",
        last_error AS "lastError"
      FROM ai_calls
      WHERE twilio_call_sid = $1
      LIMIT 1
    `;
    const rows = await this.rawQuery<AiCall[]>(sql, [sid]);
    if (!rows || rows.length === 0) return null;
    const call = rows[0];
    if (typeof call.transcript === 'string') {
      try { call.transcript = JSON.parse(call.transcript); } catch { call.transcript = []; }
    }
    if (typeof call.conversationHistory === 'string') {
      try { call.conversationHistory = JSON.parse(call.conversationHistory); } catch { call.conversationHistory = []; }
    }
    return call;
  }

  /**
   * Converts "09:00 AM" or "14:30" into minutes since midnight for accurate chronological sorting.
   */
  private parseTimeToMinutes(timeStr: string): number {
    if (!timeStr) return Number.MAX_SAFE_INTEGER;
    const trimmed = timeStr.trim().toUpperCase();
    const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = parseInt(ampmMatch[2], 10);
      const meridiem = ampmMatch[3];
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    const h24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) {
      return parseInt(h24Match[1], 10) * 60 + parseInt(h24Match[2], 10);
    }
    return Number.MAX_SAFE_INTEGER;
  }

  /**
   * Resolves patient and triage_assignments details from a phone number
   * and delegates to startCall(dto) without altering existing startCall behavior.
   */
  async startCallByPhone(dto: StartCallByPhoneDto): Promise<ReturnType<AiCallService['startCall']>> {
    if (!isValidPhoneNumber(dto.phoneNumber)) {
      const reason = `Invalid phone number format "${dto.phoneNumber}". Please provide a valid international number in E.164 format (e.g. +14165551234).`;
      this.logger.warn(reason);
      await this.logCallEvent({
        eventType: 'CALL_BLOCKED',
        level: 'WARN',
        message: reason,
        details: { phoneNumber: dto.phoneNumber },
      });
      throw new BadRequestException(reason);
    }

    const parsedNumber = parsePhoneNumber(dto.phoneNumber);
    const normalizedPhone = parsedNumber.format('E.164');
    const digitsOnly = normalizedPhone.replace(/\D/g, '');

    const rows = await this.rawQuery<{
      patientId: string;
      clinicId: string | null;
      assignmentsId: string;
      assignedPhysicianId: string | null;
      appointmentTypeId: string | null;
    }[]>(
      `SELECT
        p.id AS "patientId",
        COALESCE(ta.clinic_id, p.clinic_id) AS "clinicId",
        ta.id AS "assignmentsId",
        ta.assigned_physician_id AS "assignedPhysicianId",
        ta.appointment_type_id AS "appointmentTypeId"
      FROM patient_profiles p
      INNER JOIN triage_assignments ta ON ta.patient_id = p.id
      WHERE (
        p.phone = $1
        OR regexp_replace(COALESCE(p.phone, ''), '[^0-9+]', '', 'g') = $1
        OR regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') = $2
      )
      AND ta."scheduleType" = 1
      AND ta."approvedDate" IS NOT NULL
      ORDER BY ta."updatedAt" DESC NULLS LAST, ta."createdAt" DESC NULLS LAST
      LIMIT 1`,
      [normalizedPhone, digitsOnly],
    );

    const match = rows && rows.length > 0 ? rows[0] : null;
    if (!match) {
      const msg = `No patient with an eligible triage assignment (scheduleType = 1 and approvedDate is not null) found for phone number ${normalizedPhone}`;
      await this.logCallEvent({
        eventType: 'CALL_BLOCKED',
        level: 'WARN',
        message: msg,
        details: { phoneNumber: normalizedPhone },
      });
      throw new NotFoundException(msg);
    }

    if (!match.clinicId) {
      const msg = `Clinic ID not found for patient ${match.patientId} / assignment ${match.assignmentsId}`;
      await this.logCallEvent({
        patientId: match.patientId,
        assignmentsId: match.assignmentsId,
        eventType: 'CALL_BLOCKED',
        level: 'WARN',
        message: msg,
        details: { phoneNumber: normalizedPhone },
      });
      throw new BadRequestException(msg);
    }

    const startDto: StartCallDto = {
      phoneNumber: normalizedPhone,
      patientId: match.patientId,
      clinicId: match.clinicId,
      assignmentsId: match.assignmentsId,
      assigned_physician_id: match.assignedPhysicianId ?? undefined,
      appointment_type_id: match.appointmentTypeId ?? undefined,
      language: dto.language ?? 'en',
      callType: dto.callType ?? CallType.APPOINTMENT_CONFIRMATION,
      testMode: dto.testMode ?? false,
    };

    return this.startCall(startDto);
  }

  /**
   * Initiates an outbound AI call:
   * 1. Validates phone number in E.164 format.
   * 2. Looks up patient_profiles, triage_assignments, and physician_clinic_profiles via raw SQL.
   * 3. Requires assignment.approvedDate >= today (logs and rejects if missing or in the past).
   * 4. Finds the earliest available slot (status = 1) strictly AFTER today (date > today)
   *    and on/after approvedDate + scheduleCount * scheduleUnit, sorted chronologically via raw SQL.
   * 5. Persists AiCall (including callReason) + ai_call_logs via raw SQL, pre-warms context, and dials Twilio.
   */
  async startCall(dto: StartCallDto): Promise<{
    success: boolean;
    callId: string;
    twilioCallSid: string;
    status: string;
    callReason: string;
    slot?: {
      id: string;
      date: string;
      startTime: string;
      endTime: string;
    } | null;
    testMode?: boolean;
    webhookUrl?: string;
    hint?: string;
  }> {
    try {
      if (!isValidPhoneNumber(dto.phoneNumber)) {
        const reason = `Invalid phone number format "${dto.phoneNumber}". Please provide a valid international number in E.164 format (e.g. +14165551234).`;
        this.logger.warn(reason);
        await this.logCallEvent({
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'CALL_BLOCKED',
          level: 'WARN',
          message: reason,
          details: { phoneNumber: dto.phoneNumber, clinicId: dto.clinicId },
        });
        throw new BadRequestException(reason);
      }

      const parsedNumber = parsePhoneNumber(dto.phoneNumber);
      dto.phoneNumber = parsedNumber.format('E.164');

      // 1. Find patient and triage assignment in parallel via raw SQL
      const [patientRows, assignmentRows] = await Promise.all([
        this.rawQuery<PatientProfile[]>(
          `SELECT
            id,
            user_id AS "userId",
            clinic_id AS "clinicId",
            "firstName",
            "lastName",
            "dateOfBirth",
            phone,
            email,
            address,
            city,
            "zipCode",
            "healthCardNumber",
            "languageType",
            "emailNotifications",
            "smsNotifications",
            "hasAcceptedTerms",
            "isOnboardingComplete",
            "lastCompletedStep",
            "isActive",
            "createdAt",
            "updatedAt"
          FROM patient_profiles
          WHERE id = $1
          LIMIT 1`,
          [dto.patientId],
        ),
        this.rawQuery<TriageAssignment[]>(
          `SELECT
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
          LIMIT 1`,
          [dto.assignmentsId],
        ),
      ]);

      const patient = patientRows && patientRows.length > 0 ? patientRows[0] : null;
      const assignment = assignmentRows && assignmentRows.length > 0 ? assignmentRows[0] : null;

      if (!patient) {
        const msg = `Patient profile with ID ${dto.patientId} not found`;
        await this.logCallEvent({
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'CALL_BLOCKED',
          level: 'WARN',
          message: msg,
        });
        throw new NotFoundException(msg);
      }

      if (!assignment) {
        const msg = `Triage assignment with ID ${dto.assignmentsId} not found`;
        await this.logCallEvent({
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'CALL_BLOCKED',
          level: 'WARN',
          message: msg,
        });
        throw new NotFoundException(msg);
      }

      // 2. Validate that approvedDate is present on triage assignment
      if (!assignment.approvedDate) {
        const msg = `Call skipped: triage assignment ${dto.assignmentsId} does not have an approvedDate.`;
        this.logger.warn(`[startCall] ${msg}`);
        await this.logCallEvent({
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'CALL_BLOCKED',
          level: 'WARN',
          message: msg,
          details: { clinicId: dto.clinicId },
        });
        throw new BadRequestException(msg);
      }

      const baseDate = dayjs(assignment.approvedDate);
      const approvedDateStr = baseDate.format('YYYY-MM-DD');

      // 3. Determine and verify physician in physician_clinic_profiles via raw SQL
      const physicianId = dto.assigned_physician_id || assignment.assignedPhysicianId;
      if (!physicianId) {
        const msg = 'assigned_physician_id is required (not found in request or triage_assignments)';
        await this.logCallEvent({
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'CALL_BLOCKED',
          level: 'WARN',
          message: msg,
        });
        throw new BadRequestException(msg);
      }

      const physicianRows = await this.rawQuery<PhysicianClinicProfile[]>(
        `SELECT
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
        WHERE id = $1 AND clinic_id = $2
        LIMIT 1`,
        [physicianId, dto.clinicId],
      );
      const physicianProfile = physicianRows && physicianRows.length > 0 ? physicianRows[0] : null;

      if (!physicianProfile) {
        const msg = `Physician profile ${physicianId} not found for clinic ${dto.clinicId}`;
        await this.logCallEvent({
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'CALL_BLOCKED',
          level: 'WARN',
          message: msg,
        });
        throw new NotFoundException(msg);
      }

      // 4. Calculate minimum eligible slot date
      const count = assignment.scheduleCount || 0;
      const unitMap: Record<number, 'day' | 'week' | 'month'> = {
        1: 'day',
        2: 'week',
        3: 'month',
      };
      const unit = unitMap[assignment.scheduleUnit || 1] || 'day';
      const targetDate =
        count > 0 ? baseDate.add(count, unit).format('YYYY-MM-DD') : baseDate.format('YYYY-MM-DD');
      const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');
      const minSlotDate = targetDate > tomorrowStr ? targetDate : tomorrowStr;

      const appointmentTypeId = dto.appointment_type_id || assignment.appointmentTypeId;

      this.logger.log(
        `[Slot Lookup] patientId=${dto.patientId}, clinicId=${dto.clinicId}, physicianId=${physicianId}, appointmentTypeId=${appointmentTypeId || 'any'}, approvedDate=${approvedDateStr}, schedule=${count} ${unit}, targetDate=${targetDate}, minSlotDate=${minSlotDate}`,
      );

      // 5. Fetch available slots via raw SQL (status = 1, date >= minSlotDate) and pick earliest chronologically
      let slotSql = `
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
        WHERE clinic_id = $1
          AND physician_profile_id = $2
          AND status = 1
          AND date >= $3
      `;
      const slotParams: any[] = [dto.clinicId, physicianId, minSlotDate];
      if (appointmentTypeId) {
        slotSql += ` AND physician_apt_type_id = $4`;
        slotParams.push(appointmentTypeId);
      }
      slotSql += ` ORDER BY date ASC LIMIT 50`;

      const candidateSlots = (await this.rawQuery<PhysicianPatientSlot[]>(slotSql, slotParams)) || [];
      let availableSlot: PhysicianPatientSlot | null = null;
      if (candidateSlots.length > 0) {
        const earliestDate = candidateSlots[0].date;
        const sameDaySlots = candidateSlots.filter((s) => s.date === earliestDate);
        sameDaySlots.sort(
          (a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime),
        );
        availableSlot = sameDaySlots[0];
      }

      if (!availableSlot) {
        const msg = `No available slot (status=1) found for physician ${physicianId} in clinic ${dto.clinicId} after today on or after ${minSlotDate}`;
        await this.logCallEvent({
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'CALL_BLOCKED',
          level: 'WARN',
          message: msg,
          details: {
            clinicId: dto.clinicId,
            physicianId,
            appointmentTypeId,
            approvedDate: approvedDateStr,
            targetDate,
            minSlotDate,
          },
        });
        throw new NotFoundException(msg);
      }

      const callReason = `Appointment confirmation call for triage assignment ${dto.assignmentsId} (approvedDate=${approvedDateStr}, schedule=${count} ${unit}, minSlotDate=${minSlotDate}) offering slot ${availableSlot.id} on ${availableSlot.date} (${availableSlot.startTime}-${availableSlot.endTime}).`;

      this.logger.log(`[Slot Found] ${callReason}`);

      const aiCall = await this.saveAiCall({
        patientId: dto.patientId,
        clinicId: dto.clinicId,
        assignmentsId: dto.assignmentsId,
        assignedPhysicianId: physicianId,
        slotId: availableSlot.id,
        appointmentId: dto.assignmentsId,
        phoneNumber: dto.phoneNumber,
        language: dto.language || 'en',
        callType: dto.callType,
        status: CallStatus.INITIATED,
        currentTurn: 0,
        pendingAction: null,
        callReason,
        transcript: [],
        conversationHistory: [],
      });

      await this.logCallEvent({
        callId: aiCall.id,
        patientId: dto.patientId,
        assignmentsId: dto.assignmentsId,
        eventType: 'CALL_INITIATED',
        level: 'INFO',
        message: callReason,
        details: {
          clinicId: dto.clinicId,
          physicianId,
          appointmentTypeId,
          approvedDate: approvedDateStr,
          scheduleCount: count,
          scheduleUnit: assignment.scheduleUnit,
          targetDate,
          minSlotDate,
          slotId: availableSlot.id,
          slotDate: availableSlot.date,
          slotStartTime: availableSlot.startTime,
          slotEndTime: availableSlot.endTime,
          testMode: Boolean(dto.testMode),
        },
      });

      // Pre-warm DB context cache so Turn 2 responds immediately after language selection
      if (this.agentService) {
        void this.agentService.warmContext({
          callId: aiCall.id,
          patientId: aiCall.patientId,
          clinicId: aiCall.clinicId,
          assignedPhysicianId: aiCall.assignedPhysicianId,
          slotId: aiCall.slotId,
          assignmentsId: aiCall.assignmentsId,
        });
      }

      const publicBaseUrl = this.configService?.get<string>('PUBLIC_BASE_URL');
      if (!publicBaseUrl) {
        const errMsg = 'PUBLIC_BASE_URL is not configured';
        aiCall.status = CallStatus.FAILED;
        aiCall.lastError = errMsg;
        await this.saveAiCall(aiCall);
        await this.logCallEvent({
          callId: aiCall.id,
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'ERROR',
          level: 'ERROR',
          message: errMsg,
        });
        throw new Error(errMsg);
      }

      const slotSummary = {
        id: availableSlot.id,
        date: availableSlot.date,
        startTime: availableSlot.startTime,
        endTime: availableSlot.endTime,
      };

      if (dto.testMode) {
        aiCall.twilioCallSid = 'TEST-MODE-NO-CALL';
        aiCall.startedAt = new Date();
        await this.saveAiCall(aiCall);
        this.logger.warn(
          `[TEST MODE] Skipping real Twilio call. Trigger manually: POST /ai-call/twilio/voice?callId=${aiCall.id}`,
        );
        return {
          success: true,
          callId: aiCall.id,
          twilioCallSid: 'TEST-MODE-NO-CALL',
          status: 'initiated',
          callReason,
          slot: slotSummary,
          testMode: true,
          webhookUrl: `POST /ai-call/twilio/voice?callId=${aiCall.id}`,
          hint: 'Send { "SpeechResult": "English" } or { "Digits": "1" } to select language and start',
        };
      }

      try {
        if (!this.twilioService) {
          throw new Error('TwilioService not available');
        }
        const { callSid: twilioCallSid } = await this.traceCallMilestone(
          aiCall,
          'ai-call-start',
          'chain',
          {
            callId: aiCall.id,
            callType: aiCall.callType,
            language: aiCall.language,
            slotId: availableSlot.id,
            callReason,
          },
          () =>
            this.twilioService!.createOutboundCall(
              dto.phoneNumber,
              publicBaseUrl,
              aiCall.id,
            ),
          ['call-start'],
        );
        aiCall.twilioCallSid = twilioCallSid;
        aiCall.startedAt = new Date();
        await this.saveAiCall(aiCall);

        await this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid,
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'TWILIO_CALL_PLACED',
          level: 'INFO',
          message: `Twilio outbound call placed (SID=${twilioCallSid})`,
          details: { twilioCallSid, slotId: availableSlot.id },
        });

        return {
          success: true,
          callId: aiCall.id,
          twilioCallSid,
          status: 'initiated',
          callReason,
          slot: slotSummary,
        };
      } catch (error: any) {
        aiCall.status = CallStatus.FAILED;
        aiCall.lastError = error?.message || 'Twilio outbound call error';
        await this.saveAiCall(aiCall);

        this.logger.error(`Twilio Error Code: ${error?.code}, Message: ${error?.message}`);
        await this.logCallEvent({
          callId: aiCall.id,
          patientId: dto.patientId,
          assignmentsId: dto.assignmentsId,
          eventType: 'ERROR',
          level: 'ERROR',
          message: `Twilio outbound call failed: ${error?.message}`,
          details: { code: error?.code, message: error?.message },
        });

        const msg: string = error?.message || '';
        if (msg.includes('verified') || msg.includes('not assigned for voice calls')) {
          throw new InternalServerErrorException(
            `Twilio Trial Account Restriction: The number "${dto.phoneNumber}" is not verified. ` +
              `Go to https://console.twilio.com/us1/develop/phone-numbers/manage/verified and add this number as a Verified Caller ID before making calls.`,
          );
        }

        throw error;
      }
    } catch (error: any) {
      this.logger.error(`Error in startCall: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async handleVoiceWebhook(
    callId: string,
    speechResult: string | undefined,
    callSid: string,
    digits?: string,
    confidence?: string | number,
    defaultLang?: string,
  ): Promise<string> {
    try {
      const turnStartMs = Date.now();
      this.logger.log(
        `[handleVoiceWebhook] ▶ callId=${callId}, callSid=${callSid}, speechResult="${speechResult}", digits="${digits}", confidence="${confidence}", defaultLang="${defaultLang}"`,
      );

      const aiCall = await this.findAiCallById(callId);
      if (!aiCall) {
        await this.logCallEvent({
          callId,
          twilioCallSid: callSid || null,
          eventType: 'ERROR',
          level: 'ERROR',
          message: `AiCall with id ${callId} not found during voice webhook`,
        });
        throw new NotFoundException(`AiCall with id ${callId} not found`);
      }

      if (aiCall.status !== CallStatus.IN_PROGRESS) {
        aiCall.status = CallStatus.IN_PROGRESS;
      }
      if (!aiCall.twilioCallSid && callSid) {
        aiCall.twilioCallSid = callSid;
      }

      const publicBaseUrl = this.configService?.get<string>('PUBLIC_BASE_URL');
      const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${aiCall.id}`;

      // TURN 1: Call Connected — ask for Language preference first
      if (aiCall.currentTurn === 0 && !speechResult && !digits && !defaultLang) {
        aiCall.currentTurn = 1;
        await this.saveAiCall(aiCall);
        void this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid: aiCall.twilioCallSid,
          patientId: aiCall.patientId,
          assignmentsId: aiCall.assignmentsId,
          eventType: 'CALL_CONNECTED',
          level: 'INFO',
          message: 'Turn 1: Playing bilingual language selection prompt',
        });
        return this.twilioService?.generateLanguageSelectionTwiML(actionUrl) || '';
      }

      const digitsInput = (digits || '').trim();
      const speechTrimmed = (speechResult || '').trim();
      const speechLower = speechTrimmed.toLowerCase();
      const parsedConfidence =
        confidence !== undefined && confidence !== null
          ? parseFloat(confidence.toString())
          : 1.0;

      const isEmptySpeech = !digitsInput && !speechTrimmed && !defaultLang;
      const speechWordCount = speechLower.split(/\s+/).filter(Boolean).length;
      const recognizedIntentWords =
        /\b(yes|yeah|yep|yup|sure|ok|okay|please|no|nope|nah|confirm|cancel|book|schedule|appointment|thanks|thank|english|french|français|francais|oui|non|confirmer|annuler|merci|d'accord|rendez-vous|hello|hi|bonjour|one|two|un|deux)\b/i;
      const hasRecognizedWord = recognizedIntentWords.test(speechLower);
      const isPhantomNoise =
        !digitsInput &&
        Boolean(speechTrimmed) &&
        !isNaN(parsedConfidence) &&
        !hasRecognizedWord &&
        ((speechWordCount <= 3 && parsedConfidence < 0.35) || parsedConfidence < 0.2);

      if (isEmptySpeech || isPhantomNoise) {
        const currentRetries = (this.noInputRetryCounts.get(aiCall.id) || 0) + 1;
        this.noInputRetryCounts.set(aiCall.id, currentRetries);

        this.logger.warn(
          isEmptySpeech
            ? `[handleVoiceWebhook] ⚠️ Empty STT/DTMF received on turn=${aiCall.currentTurn} (retry ${currentRetries}/${MAX_NO_INPUT_RETRIES}). Re-prompting caller.`
            : `[handleVoiceWebhook] ⚠️ Phantom acoustic noise discarded (confidence=${confidence}, text="${speechResult}", retry ${currentRetries}/${MAX_NO_INPUT_RETRIES}).`,
        );
        void this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid: aiCall.twilioCallSid,
          patientId: aiCall.patientId,
          assignmentsId: aiCall.assignmentsId,
          eventType: isEmptySpeech ? 'EMPTY_SPEECH' : 'PHANTOM_NOISE',
          level: 'WARN',
          message: isEmptySpeech
            ? `Empty speech/DTMF received (retry ${currentRetries}/${MAX_NO_INPUT_RETRIES}); re-prompting caller`
            : `Discarded low-confidence speech (${confidence}, retry ${currentRetries}/${MAX_NO_INPUT_RETRIES})`,
          details: { speechResult, confidence, currentTurn: aiCall.currentTurn, retry: currentRetries },
        });

        if (currentRetries > MAX_NO_INPUT_RETRIES) {
          const maxRetryMsg =
            aiCall.language === 'fr'
              ? "Je suis désolée, je ne parviens toujours pas à vous entendre. Veuillez contacter la clinique directement. Au revoir."
              : "I'm sorry, I still couldn't hear you clearly. Please call the clinic directly. Goodbye.";
          aiCall.status = CallStatus.COMPLETED;
          aiCall.endedAt = new Date();
          await this.saveAiCall(aiCall);
          this.noInputRetryCounts.delete(aiCall.id);
          this.agentService?.clearContextCache(aiCall.id);
          void this.logCallEvent({
            callId: aiCall.id,
            twilioCallSid: aiCall.twilioCallSid,
            patientId: aiCall.patientId,
            assignmentsId: aiCall.assignmentsId,
            eventType: 'NO_INPUT_MAX_RETRIES',
            level: 'WARN',
            message: `Call ended after exceeding MAX_NO_INPUT_RETRIES (${MAX_NO_INPUT_RETRIES})`,
          });
          return this.twilioService?.generateTwiML(maxRetryMsg, aiCall.language) || '';
        }

        if (aiCall.currentTurn <= 1) {
          return this.twilioService?.generateLanguageSelectionTwiML(actionUrl) || '';
        }
        const lastAiMessage = [...aiCall.transcript]
          .reverse()
          .find((msg) => msg.role === 'assistant');
        const repromptPrefix =
          aiCall.language === 'fr'
            ? isEmptySpeech
              ? 'Désolée, je ne vous ai pas bien entendu. '
              : "Désolée, je n'ai pas compris. "
            : isEmptySpeech
              ? "Sorry, I didn't hear you clearly. "
              : "Sorry, I didn't catch that. ";

        if (lastAiMessage?.content) {
          return (
            this.twilioService?.generateGatherTwiML(
              `${repromptPrefix}${lastAiMessage.content}`,
              actionUrl,
              aiCall.language,
            ) || ''
          );
        }
        const silentRegather =
          aiCall.language === 'fr'
            ? `${repromptPrefix}Pouvez-vous répéter s'il vous plaît?`
            : `${repromptPrefix}Could you please repeat that?`;
        return (
          this.twilioService?.generateGatherTwiML(
            silentRegather,
            actionUrl,
            aiCall.language,
          ) || ''
        );
      }

      // Valid input received — reset consecutive no-input retry counter
      this.noInputRetryCounts.delete(aiCall.id);

      const isLanguageSelectionTurn = aiCall.currentTurn === 1;

      // Reject invalid DTMF keypad options before incrementing turn count
      if (isLanguageSelectionTurn && digitsInput && digitsInput !== '1' && digitsInput !== '2') {
        return this.twilioService?.generateLanguageSelectionTwiML(actionUrl) || '';
      }

      if (!isLanguageSelectionTurn && digitsInput && !['1', '2', '3'].includes(digitsInput)) {
        const currentLang = aiCall.language || 'en';
        const invalidDigitMsg =
          currentLang === 'fr'
            ? "Touche non reconnue. Appuyez sur 1 pour confirmer, sur 2 pour annuler, ou dites-moi comment je peux vous aider."
            : 'I did not recognize that keypad option. Please press 1 to confirm, press 2 to cancel, or tell me how I can help.';
        return (
          this.twilioService?.generateGatherTwiML(
            invalidDigitMsg,
            actionUrl,
            currentLang,
          ) || ''
        );
      }

      aiCall.currentTurn += 1;
      if (aiCall.currentTurn > MAX_CALL_TURNS) {
        const maxTurnMsg =
          aiCall.language === 'fr'
            ? "Je suis désolée, nous avons atteint la durée maximale d'appel. Veuillez contacter directement la clinique. Au revoir."
            : "I'm sorry, but we have reached the maximum conversation length. Please call the clinic directly. Goodbye.";
        aiCall.status = CallStatus.COMPLETED;
        aiCall.endedAt = new Date();
        await this.saveAiCall(aiCall);
        this.pendingResponses.delete(aiCall.id);
        this.noInputRetryCounts.delete(aiCall.id);
        this.agentService?.clearContextCache(aiCall.id);
        void this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid: aiCall.twilioCallSid,
          patientId: aiCall.patientId,
          assignmentsId: aiCall.assignmentsId,
          eventType: 'MAX_TURNS_REACHED',
          level: 'WARN',
          message: `Call ended after exceeding MAX_CALL_TURNS (${MAX_CALL_TURNS})`,
        });
        return this.twilioService?.generateTwiML(maxTurnMsg, aiCall.language) || '';
      }

      let detectedLanguage = aiCall.language || 'en';
      let userIntent = '';

      const cleanedGreeting = speechLower.replace(/[?.!,]/g, '').trim();
      const isEnGreetingWord = ['hello', 'hi', 'hey', 'yes', 'yeah', 'yep', 'sure', 'okay', 'ok'].includes(
        cleanedGreeting,
      );
      const isFrGreetingWord = ['bonjour', 'allô', 'allo', 'oui', 'salut'].includes(cleanedGreeting);

      const extractTurn1Remainder = (raw: string): string => {
        const stripped = raw
          .replace(/^(?:please\s+)?(?:continue\s+in\s+|in\s+|speak\s+)?(english|anglais|french|français|francais|one|two|un|deux)(?:[\s,;:.!?-]+|$)/i, '')
          .trim();
        if (!stripped) return '';
        const strippedLower = stripped.toLowerCase().replace(/[?.!,]/g, '').trim();
        if (['please', 'thanks', 'thank you', "s'il vous plaît", 'merci'].includes(strippedLower)) {
          return '';
        }
        return stripped;
      };

      if (defaultLang === 'en') {
        detectedLanguage = 'en';
      } else if (
        aiCall.currentTurn === 2 &&
        (digitsInput === '1' ||
          speechLower === 'english' ||
          speechLower.includes('english') ||
          speechLower === 'anglais' ||
          speechLower === 'one')
      ) {
        detectedLanguage = 'en';
        if (speechTrimmed && !digitsInput) {
          userIntent = extractTurn1Remainder(speechTrimmed);
        }
      } else if (
        aiCall.currentTurn === 2 &&
        (digitsInput === '2' ||
          speechLower === 'french' ||
          speechLower.includes('french') ||
          speechLower === 'français' ||
          speechLower === 'francais' ||
          speechLower === 'deux' ||
          speechLower === 'two' ||
          isFrGreetingWord)
      ) {
        detectedLanguage = 'fr';
        if (speechTrimmed && !digitsInput && !isFrGreetingWord) {
          userIntent = extractTurn1Remainder(speechTrimmed);
        }
      } else if (aiCall.currentTurn === 2 && isEnGreetingWord) {
        detectedLanguage = 'en';
      } else if (this.isLikelyFrench(speechLower)) {
        detectedLanguage = 'fr';
        userIntent = speechResult || '';
      } else if (speechResult) {
        userIntent = speechResult;
      }

      if (aiCall.currentTurn > 2 && digitsInput) {
        if (digitsInput === '1') {
          userIntent =
            detectedLanguage === 'fr'
              ? 'Je confirme mon rendez-vous.'
              : 'I would like to confirm my appointment.';
        } else if (digitsInput === '2' || digitsInput === '3') {
          userIntent =
            detectedLanguage === 'fr'
              ? 'Je souhaite annuler mon rendez-vous.'
              : 'I would like to cancel my appointment.';
        }
      }

      aiCall.language = detectedLanguage;

      if (aiCall.currentTurn === 2) {
        void this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid: aiCall.twilioCallSid,
          patientId: aiCall.patientId,
          assignmentsId: aiCall.assignmentsId,
          eventType: 'LANGUAGE_SELECTED',
          level: 'INFO',
          message: `Language selected: ${detectedLanguage}`,
          details: {
            language: detectedLanguage,
            speechResult: speechResult || null,
            digits: digitsInput || null,
            defaultLang: defaultLang || null,
            carriedIntent: userIntent || null,
          },
        });
      }

      let userMessage = '';
      if (userIntent) {
        userMessage = userIntent;
      } else if (aiCall.currentTurn === 2) {
        userMessage = 'LANGUAGE_SELECTED';
      } else if (speechResult) {
        userMessage = speechResult;
      } else {
        userMessage = 'HELLO';
      }

      if (speechResult || userIntent) {
        this.logger.log(
          `[handleVoiceWebhook] 🗣️ Caller STT (turn ${aiCall.currentTurn}): "${speechResult || userIntent}"`,
        );
        aiCall.transcript.push({
          role: 'user',
          content: speechResult || userIntent,
          timestamp: new Date().toISOString(),
        });
      }

      const conversationHistory = this.deserializeHistory(aiCall.conversationHistory || []);

      this.pendingResponses.set(callId, null);
      const agentPromise = this.processAgentAsync(
        aiCall,
        userMessage,
        conversationHistory,
        publicBaseUrl || '',
        turnStartMs,
      );

      const timeoutPromise = new Promise<'TIMEOUT'>((resolve) =>
        setTimeout(() => resolve('TIMEOUT'), 7500),
      );
      const winner = await Promise.race([
        agentPromise.then(() => 'DONE' as const),
        timeoutPromise,
      ]);

      if (winner === 'DONE') {
        const directTwiml = this.pendingResponses.get(callId);
        if (directTwiml) {
          this.pendingResponses.delete(callId);
          return directTwiml;
        }
      }

      const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
      return this.twilioService?.generateHoldTwiML(pollUrl, aiCall.language) || '';
    } catch (error: any) {
      this.logger.error(`Error in handleVoiceWebhook for callId=${callId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  private isLikelyFrench(text: string): boolean {
    const frenchWords = [
      'bonjour', 'oui', 'non', 'merci', 'rendez-vous', 'annuler', 'confirmer',
      'demain', 'salut', 'plaît', 'plait', 'docteur', 'suis',
      'horaire', 'heure', 'matin', 'soir', 'clinique', 'médecin',
    ];
    return frenchWords.some((word) => text.includes(word));
  }

  private async processAgentAsync(
    aiCall: AiCall,
    userMessage: string,
    conversationHistory: BaseMessage[],
    publicBaseUrl: string,
    turnStartMs: number,
  ): Promise<void> {
    const callId = aiCall.id;
    try {
      if (!this.agentService) {
        throw new Error('AgentService not available');
      }

      const result = await this.agentService.runAgentTurn({
        callId: aiCall.id,
        patientId: aiCall.patientId,
        assignmentsId: aiCall.assignmentsId,
        assignedPhysicianId: aiCall.assignedPhysicianId,
        slotId: aiCall.slotId,
        clinicId: aiCall.clinicId,
        twilioCallSid: aiCall.twilioCallSid,
        language: aiCall.language,
        callType: aiCall.callType,
        userMessage,
        conversationHistory,
        phoneNumber: aiCall.phoneNumber,
        pendingAction: aiCall.pendingAction ?? null,
      });

      aiCall.transcript.push({
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString(),
      });
      aiCall.conversationHistory = this.serializeHistory(result.updatedHistory);
      aiCall.pendingAction = result.nextPendingAction ?? null;

      if (result.llmError) {
        aiCall.lastError = result.llmError;
        void this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid: aiCall.twilioCallSid,
          patientId: aiCall.patientId,
          assignmentsId: aiCall.assignmentsId,
          eventType: 'ERROR',
          level: 'ERROR',
          message: `LLM invocation error on turn ${aiCall.currentTurn}: ${result.llmError}`,
          details: { userMessage, turn: aiCall.currentTurn },
        });
      }

      let twiml: string;
      let responseTextToSpeak = result.response;
      this.logger.log(
        `[processAgentAsync] 🤖 Agent Speaking to Caller (turn ${aiCall.currentTurn}, complete=${result.isComplete}): "${responseTextToSpeak}"`,
      );

      if (result.isComplete) {
        const finalOutcome =
          result.actionResult === 'CONFIRMED'
            ? CallOutcome.CONFIRMED
            : result.actionResult === 'CANCELLED'
              ? CallOutcome.CANCELLED
              : result.actionResult === 'RESCHEDULED'
                ? CallOutcome.RESCHEDULED
                : result.actionResult === 'CALL_LATER'
                  ? CallOutcome.CALL_LATER
                  : this.detectOutcome(result.response);

        if (finalOutcome === CallOutcome.CONFIRMED && aiCall.slotId) {
          const bookingResult = await this.bookConfirmedSlot(aiCall);
          if (!bookingResult.booked) {
            aiCall.outcome = CallOutcome.FAILED;
            aiCall.lastError = bookingResult.reason || 'Slot no longer available';
            responseTextToSpeak =
              aiCall.language === 'fr'
                ? "Désolée, ce créneau n'est plus disponible. Veuillez contacter directement la clinique. Au revoir."
                : 'Sorry, that appointment slot is no longer available. Please contact the clinic directly. Goodbye.';
            aiCall.transcript[aiCall.transcript.length - 1].content = responseTextToSpeak;
          } else {
            aiCall.outcome = CallOutcome.CONFIRMED;
          }
        } else {
          aiCall.outcome = finalOutcome;
          if (finalOutcome === CallOutcome.CANCELLED) {
            void this.logCallEvent({
              callId: aiCall.id,
              twilioCallSid: aiCall.twilioCallSid,
              patientId: aiCall.patientId,
              assignmentsId: aiCall.assignmentsId,
              eventType: 'APPOINTMENT_CANCELLED',
              level: 'INFO',
              message: `Caller confirmed cancellation for slot ${aiCall.slotId || 'unknown'}`,
              details: { slotId: aiCall.slotId, turn: aiCall.currentTurn },
            });
          } else if (finalOutcome === CallOutcome.RESCHEDULED) {
            void this.logCallEvent({
              callId: aiCall.id,
              twilioCallSid: aiCall.twilioCallSid,
              patientId: aiCall.patientId,
              assignmentsId: aiCall.assignmentsId,
              eventType: 'APPOINTMENT_RESCHEDULE_REQUESTED',
              level: 'INFO',
              message: `Caller requested reschedule for slot ${aiCall.slotId || 'unknown'}`,
              details: { slotId: aiCall.slotId, turn: aiCall.currentTurn },
            });
          } else if (finalOutcome === CallOutcome.CALL_LATER) {
            void this.logCallEvent({
              callId: aiCall.id,
              twilioCallSid: aiCall.twilioCallSid,
              patientId: aiCall.patientId,
              assignmentsId: aiCall.assignmentsId,
              eventType: 'CALL_LATER_REQUESTED',
              level: 'INFO',
              message: `Caller requested callback later for slot ${aiCall.slotId || 'unknown'}`,
              details: { slotId: aiCall.slotId, turn: aiCall.currentTurn },
            });
          }
        }

        aiCall.status = CallStatus.COMPLETED;
        aiCall.endedAt = new Date();
        aiCall.pendingAction = null;
        this.noInputRetryCounts.delete(callId);
        this.agentService.clearContextCache(callId);

        this.logger.log(`[processAgentAsync] 📞 Call COMPLETE — outcome=${aiCall.outcome}`);
        twiml = this.twilioService?.generateTwiML(responseTextToSpeak, aiCall.language) || '';
      } else {
        const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${aiCall.id}`;
        twiml =
          this.twilioService?.generateGatherTwiML(
            responseTextToSpeak,
            actionUrl,
            aiCall.language,
            result.sttHints,
          ) || '';
      }

      await this.saveAiCall(aiCall);
      this.pendingResponses.set(callId, twiml);

      const latencyMs = Date.now() - turnStartMs;
      void this.logCallEvent({
        callId: aiCall.id,
        twilioCallSid: aiCall.twilioCallSid,
        patientId: aiCall.patientId,
        assignmentsId: aiCall.assignmentsId,
        eventType:
          result.nextPendingAction === 'CONFIRM'
            ? 'CONFIRM_PROMPTED'
            : result.nextPendingAction === 'CANCEL'
              ? 'CANCEL_PROMPTED'
              : 'TURN_PROCESSED',
        level: 'INFO',
        message: `Turn ${aiCall.currentTurn} processed via ${result.intentPath} in ${latencyMs}ms`,
        details: {
          turn: aiCall.currentTurn,
          userMessage,
          normalizedUserMessage:
            result.normalizedUserMessage && result.normalizedUserMessage !== userMessage
              ? result.normalizedUserMessage
              : undefined,
          response: responseTextToSpeak,
          intentPath: result.intentPath,
          pendingAction: aiCall.pendingAction,
          actionResult: result.actionResult,
          isComplete: result.isComplete,
          latencyMs,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `[processAgentAsync] ❌ Error for callId=${callId}: ${error?.name} — ${error?.message}`,
      );
      aiCall.lastError = error?.message || 'Unexpected error in processAgentAsync';
      await this.saveAiCall(aiCall).catch(() => undefined);
      void this.logCallEvent({
        callId: aiCall.id,
        twilioCallSid: aiCall.twilioCallSid,
        patientId: aiCall.patientId,
        assignmentsId: aiCall.assignmentsId,
        eventType: 'ERROR',
        level: 'ERROR',
        message: `Error in processAgentAsync: ${error?.message}`,
        details: { stack: error?.stack, userMessage },
      });

      const fallbackMsg =
        aiCall.language === 'fr'
          ? 'Nous éprouvons des difficultés techniques. Veuillez appeler la clinique directement. Au revoir.'
          : 'We are experiencing technical difficulties. Please call the clinic directly. Goodbye.';
      const fallback = this.twilioService?.generateTwiML(fallbackMsg, aiCall.language) || '';
      this.pendingResponses.set(callId, fallback);
    }
  }

  /**
   * Atomically marks physician_patient_slots.status = 2 (booked) inside a DB transaction
   * and inserts a row into patient_appointment_bookings via raw SQL queries.
   */
  private async bookConfirmedSlot(
    aiCall: AiCall,
  ): Promise<{ booked: boolean; bookingId?: string; reason?: string }> {
    try {
      if (!this.dataSource) {
        throw new Error('DataSource not available for transaction');
      }

      return await this.traceCallMilestone(
        aiCall,
        'db-book-confirmed-slot',
        'tool',
        {
          callId: aiCall.id,
          slotId: aiCall.slotId,
          patientId: aiCall.patientId,
        },
        () =>
          this.dataSource.transaction(async (manager) => {
        const slots: PhysicianPatientSlot[] = await manager.query(
          `SELECT
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
          FOR UPDATE`,
          [aiCall.slotId],
        );
        const slot = slots && slots.length > 0 ? slots[0] : null;

        if (!slot) {
          const reason = `Slot ${aiCall.slotId} not found during confirmation booking.`;
          this.logger.warn(`[bookConfirmedSlot] ${reason}`);
          await this.logCallEvent({
            callId: aiCall.id,
            twilioCallSid: aiCall.twilioCallSid,
            patientId: aiCall.patientId,
            assignmentsId: aiCall.assignmentsId,
            eventType: 'BOOKING_CONFLICT',
            level: 'ERROR',
            message: reason,
          });
          return { booked: false, reason };
        }

        const existingBookings: PatientAppointmentBooking[] = await manager.query(
          `SELECT
            id,
            patient_id AS "patientId",
            clinic_id AS "clinicId",
            physician_profile_id AS "physicianProfileId",
            patient_slot_id AS "patientSlotId",
            TO_CHAR("appointmentDate", 'YYYY-MM-DD') AS "appointmentDate",
            "startTime",
            "endTime",
            status,
            "patientNote",
            "bookedBy",
            "appointmentFormattedId",
            "createdAt",
            "updatedAt"
          FROM patient_appointment_bookings
          WHERE patient_slot_id = $1
          LIMIT 1`,
          [slot.id],
        );
        const existingBooking =
          existingBookings && existingBookings.length > 0 ? existingBookings[0] : null;

        if (existingBooking) {
          if (existingBooking.patientId === aiCall.patientId) {
            return { booked: true, bookingId: existingBooking.id };
          }
          const reason = `Slot ${slot.id} was already booked by another patient (booking=${existingBooking.id}).`;
          this.logger.warn(`[bookConfirmedSlot] ${reason}`);
          await this.logCallEvent({
            callId: aiCall.id,
            twilioCallSid: aiCall.twilioCallSid,
            patientId: aiCall.patientId,
            assignmentsId: aiCall.assignmentsId,
            eventType: 'BOOKING_CONFLICT',
            level: 'ERROR',
            message: reason,
            details: { slotId: slot.id, existingBookingId: existingBooking.id },
          });
          return { booked: false, reason };
        }

        if (slot.status !== 1) {
          const reason = `Slot ${slot.id} is no longer available (status=${slot.status}).`;
          this.logger.warn(`[bookConfirmedSlot] ${reason}`);
          await this.logCallEvent({
            callId: aiCall.id,
            twilioCallSid: aiCall.twilioCallSid,
            patientId: aiCall.patientId,
            assignmentsId: aiCall.assignmentsId,
            eventType: 'BOOKING_CONFLICT',
            level: 'ERROR',
            message: reason,
            details: { slotId: slot.id, status: slot.status },
          });
          return { booked: false, reason };
        }

        await manager.query(
          `UPDATE physician_patient_slots
           SET status = 2, "updatedAt" = NOW()
           WHERE id = $1`,
          [slot.id],
        );

        const newBookings: PatientAppointmentBooking[] = await manager.query(
          `INSERT INTO patient_appointment_bookings (
            patient_id, clinic_id, physician_profile_id,
            patient_slot_id, "appointmentDate", "startTime",
            "endTime", status, "bookedBy", "patientNote"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          ) RETURNING
            id,
            patient_id AS "patientId",
            clinic_id AS "clinicId",
            physician_profile_id AS "physicianProfileId",
            patient_slot_id AS "patientSlotId",
            TO_CHAR("appointmentDate", 'YYYY-MM-DD') AS "appointmentDate",
            "startTime",
            "endTime",
            status,
            "patientNote",
            "bookedBy",
            "appointmentFormattedId",
            "createdAt",
            "updatedAt"`,
          [
            aiCall.patientId,
            aiCall.clinicId,
            slot.physicianProfileId,
            slot.id,
            slot.date,
            slot.startTime,
            slot.endTime,
            1,
            1,
            `Confirmed via AI call ${aiCall.id}`,
          ],
        );
        const booking = newBookings && newBookings.length > 0 ? newBookings[0] : null;

        this.logger.log(
          `[bookConfirmedSlot] ✅ Slot ${slot.id} marked status=2 and booking ${booking?.id} created.`,
        );
        await this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid: aiCall.twilioCallSid,
          patientId: aiCall.patientId,
          assignmentsId: aiCall.assignmentsId,
          eventType: 'BOOKING_CONFIRMED',
          level: 'INFO',
          message: `Slot ${slot.id} booked (${slot.date} ${slot.startTime}-${slot.endTime}), bookingId=${booking?.id}`,
          details: {
            slotId: slot.id,
            bookingId: booking?.id,
            appointmentDate: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
          },
        });

        return { booked: true, bookingId: booking?.id };
      }),
        ['db-booking'],
      );
    } catch (error: any) {
      this.logger.error(`Error in bookConfirmedSlot for callId=${aiCall.id}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async handlePollWebhook(callId: string): Promise<string> {
    try {
      const publicBaseUrl = this.configService?.get<string>('PUBLIC_BASE_URL');

      if (!this.pendingResponses.has(callId)) {
        await this.logCallEvent({
          callId,
          eventType: 'ERROR',
          level: 'ERROR',
          message: `Poll webhook called for callId=${callId} with no pending response`,
        });
        return (
          this.twilioService?.generateTwiML(
            'An error occurred. Please call the clinic directly. Goodbye.',
            'en',
          ) || ''
        );
      }

      const twiml = this.pendingResponses.get(callId);
      if (twiml === null) {
        const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
        return this.twilioService?.generatePollWaitTwiML(pollUrl) || '';
      }

      this.pendingResponses.delete(callId);
      return twiml;
    } catch (error: any) {
      this.logger.error(`Error in handlePollWebhook for callId=${callId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async handleStatusCallback(body: any): Promise<void> {
    try {
      if (!body.CallSid) return;
      const aiCall = await this.findAiCallByTwilioSid(body.CallSid);
      if (!aiCall) return;

      const statusMap: Record<string, CallStatus> = {
        initiated: CallStatus.INITIATED,
        ringing: CallStatus.RINGING,
        answered: CallStatus.ANSWERED,
        completed: CallStatus.COMPLETED,
        busy: CallStatus.FAILED,
        failed: CallStatus.FAILED,
        'no-answer': CallStatus.NO_ANSWER,
        canceled: CallStatus.FAILED,
      };

      const newStatus = statusMap[body.CallStatus];
      if (newStatus && aiCall.status !== CallStatus.COMPLETED) {
        aiCall.status = newStatus;
      }

      if (body.CallStatus === 'completed') {
        aiCall.status = CallStatus.COMPLETED;
        aiCall.endedAt = new Date();
        if (body.CallDuration) {
          aiCall.duration = parseInt(body.CallDuration, 10);
        }
      }

      const isErrorStatus = ['busy', 'failed', 'no-answer', 'canceled'].includes(body.CallStatus);
      if (isErrorStatus && body.ErrorMessage) {
        aiCall.lastError = body.ErrorMessage;
      }

      const isTerminalStatus = ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(
        body.CallStatus,
      );
      if (isTerminalStatus) {
        this.pendingResponses.delete(aiCall.id);
        this.noInputRetryCounts.delete(aiCall.id);
        this.agentService?.clearContextCache(aiCall.id);
      }

      await this.saveAiCall(aiCall);

      if (isTerminalStatus) {
        await this.traceCallMilestone(
          aiCall,
          'ai-call-terminal-status',
          'chain',
          {
            callId: aiCall.id,
            twilioCallSid: body.CallSid,
            callStatus: body.CallStatus,
            callDurationSec: body.CallDuration ? parseInt(body.CallDuration, 10) : null,
            outcome: aiCall.outcome ?? null,
            errorCode: body.ErrorCode ?? null,
            errorMessage: body.ErrorMessage ?? null,
          },
          async () => ({
            status: aiCall.status,
            outcome: aiCall.outcome ?? null,
            durationSec: aiCall.duration ?? null,
            totalTurns: aiCall.currentTurn,
          }),
          ['call-end', `status-${body.CallStatus}`],
        ).catch(() => undefined);
      }

      void this.logCallEvent({
        callId: aiCall.id,
        twilioCallSid: body.CallSid,
        patientId: aiCall.patientId,
        assignmentsId: aiCall.assignmentsId,
        eventType: 'TWILIO_STATUS',
        level: isErrorStatus ? 'ERROR' : 'INFO',
        message: `Twilio status callback: ${body.CallStatus}${body.CallDuration ? ` (${body.CallDuration}s)` : ''}`,
        details: {
          callStatus: body.CallStatus,
          callDuration: body.CallDuration,
          errorCode: body.ErrorCode,
          errorMessage: body.ErrorMessage,
        },
      });
    } catch (error: any) {
      this.logger.error(`Error in handleStatusCallback: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async getCall(id: string): Promise<AiCall> {
    try {
      const aiCall = await this.findAiCallById(id);
      if (!aiCall) {
        throw new NotFoundException(`AiCall with id ${id} not found`);
      }
      const { conversationHistory: _conversationHistory, ...safeCall } = aiCall;
      return safeCall as AiCall;
    } catch (error: any) {
      this.logger.error(`Error in getCall for ID ${id}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async getTranscript(id: string): Promise<{
    callId: string;
    transcript: ConversationMessage[];
    status: string;
    outcome: string | null;
  }> {
    try {
      const aiCall = await this.findAiCallById(id);
      if (!aiCall) {
        throw new NotFoundException(`AiCall with id ${id} not found`);
      }
      return {
        callId: id,
        transcript: aiCall.transcript || [],
        status: aiCall.status,
        outcome: aiCall.outcome,
      };
    } catch (error: any) {
      this.logger.error(`Error in getTranscript for ID ${id}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async getLogs(id: string): Promise<{ callId: string; logs: AiCallLog[] }> {
    try {
      const aiCall = await this.findAiCallById(id);
      if (!aiCall) {
        throw new NotFoundException(`AiCall with id ${id} not found`);
      }
      const sql = `
        SELECT
          id,
          call_id AS "callId",
          twilio_call_sid AS "twilioCallSid",
          patient_id AS "patientId",
          assignments_id AS "assignmentsId",
          event_type AS "eventType",
          level,
          message,
          details,
          created_at AS "createdAt"
        FROM ai_call_logs
        WHERE call_id = $1
        ORDER BY created_at ASC
      `;
      const logs = (await this.rawQuery<AiCallLog[]>(sql, [id])) || [];
      return { callId: id, logs };
    } catch (error: any) {
      this.logger.error(`Error in getLogs for ID ${id}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  private serializeHistory(history: BaseMessage[]): any[] {
    return history.map((msg) => ({
      _getType: msg._getType(),
      content: msg.content,
    }));
  }

  private deserializeHistory(stored: any[]): BaseMessage[] {
    return stored.map((msg) => {
      if (msg._getType === 'human') return new HumanMessage(msg.content);
      if (msg._getType === 'ai') return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    });
  }

  private detectOutcome(responseText: string): CallOutcome {
    const text = responseText.toLowerCase();
    if (text.includes('confirm') || text.includes('confirmé') || text.includes('confirme')) {
      return CallOutcome.CONFIRMED;
    }
    if (text.includes('cancel') || text.includes('annul')) return CallOutcome.CANCELLED;
    if (text.includes('reschedule') || text.includes('report') || text.includes('déplacé')) {
      return CallOutcome.RESCHEDULED;
    }
    if (text.includes('call you back') || text.includes('rappeller') || text.includes('rappeler')) {
      return CallOutcome.CALL_LATER;
    }
    return CallOutcome.UNKNOWN;
  }
}
