import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
} from '../entities';
import { StartCallDto } from './dto/start-call.dto';
import { TwilioService } from '../twilio/twilio.service';
import { AgentService } from '../langchain/agent/agent.service';
import { CallStatus, CallOutcome, MAX_CALL_TURNS } from '../common/constants';

@Injectable()
export class AiCallService {
  private readonly logger = new Logger(AiCallService.name);
  private readonly pendingResponses = new Map<string, string | null>();

  constructor(
    @InjectRepository(AiCall)
    private readonly aiCallRepository: Repository<AiCall>,
    @InjectRepository(AiCallLog)
    private readonly aiCallLogRepository: Repository<AiCallLog>,
    @InjectRepository(PatientProfile)
    private readonly patientProfileRepository: Repository<PatientProfile>,
    @InjectRepository(TriageAssignment)
    private readonly triageAssignmentRepository: Repository<TriageAssignment>,
    @InjectRepository(PhysicianClinicProfile)
    private readonly physicianClinicProfileRepository: Repository<PhysicianClinicProfile>,
    @InjectRepository(PhysicianPatientSlot)
    private readonly physicianPatientSlotRepository: Repository<PhysicianPatientSlot>,
    @InjectRepository(PatientAppointmentBooking)
    private readonly bookingRepository: Repository<PatientAppointmentBooking>,
    private readonly dataSource: DataSource,
    private readonly twilioService: TwilioService,
    private readonly agentService: AgentService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Persists an audit/error log entry to ai_call_logs without throwing.
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
      const entry = this.aiCallLogRepository.create({
        callId: params.callId ?? null,
        twilioCallSid: params.twilioCallSid ?? null,
        patientId: params.patientId ?? null,
        assignmentsId: params.assignmentsId ?? null,
        eventType: params.eventType,
        level: params.level ?? 'INFO',
        message: params.message,
        details: params.details ?? null,
      });
      await this.aiCallLogRepository.save(entry);
    } catch (err: any) {
      this.logger.warn(`[logCallEvent] Failed to persist log (${params.eventType}): ${err?.message}`);
    }
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
   * Initiates an outbound AI call:
   * 1. Validates phone number in E.164 format.
   * 2. Looks up patient_profiles, triage_assignments, and physician_clinic_profiles.
   * 3. Requires assignment.approvedDate >= today (logs and rejects if missing or in the past).
   * 4. Finds the earliest available slot (status = 1) strictly AFTER today (date > today)
   *    and on/after approvedDate + scheduleCount * scheduleUnit, sorted chronologically.
   * 5. Persists AiCall (including callReason) + ai_call_logs, pre-warms context, and dials Twilio.
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

    // 1. Find patient and triage assignment in parallel
    const [patient, assignment] = await Promise.all([
      this.patientProfileRepository.findOne({ where: { id: dto.patientId } }),
      this.triageAssignmentRepository.findOne({ where: { id: dto.assignmentsId } }),
    ]);

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

    // 3. Determine and verify physician in physician_clinic_profiles
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

    const physicianProfile = await this.physicianClinicProfileRepository.findOne({
      where: { id: physicianId, clinicId: dto.clinicId },
    });
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

    // 4. Calculate minimum eligible slot date:
    //    max(approvedDate + scheduleCount * scheduleUnit, tomorrow) so slot is strictly AFTER today
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

    // 5. Fetch available slots (status = 1, date >= minSlotDate) and pick earliest chronologically
    const slotQuery = this.physicianPatientSlotRepository
      .createQueryBuilder('slot')
      .where('slot.clinic_id = :clinicId', { clinicId: dto.clinicId })
      .andWhere('slot.physician_profile_id = :physicianId', { physicianId })
      .andWhere('slot.status = :status', { status: 1 })
      .andWhere('slot.date >= :minSlotDate', { minSlotDate });

    if (appointmentTypeId) {
      slotQuery.andWhere('slot.physician_apt_type_id = :appointmentTypeId', {
        appointmentTypeId,
      });
    }

    const candidateSlots = await slotQuery.orderBy('slot.date', 'ASC').take(50).getMany();
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

    const aiCall = this.aiCallRepository.create({
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

    await this.aiCallRepository.save(aiCall);

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
    void this.agentService.warmContext({
      callId: aiCall.id,
      patientId: aiCall.patientId,
      clinicId: aiCall.clinicId,
      assignedPhysicianId: aiCall.assignedPhysicianId,
      slotId: aiCall.slotId,
      assignmentsId: aiCall.assignmentsId,
    });

    const publicBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');
    if (!publicBaseUrl) {
      const errMsg = 'PUBLIC_BASE_URL is not configured';
      aiCall.status = CallStatus.FAILED;
      aiCall.lastError = errMsg;
      await this.aiCallRepository.save(aiCall);
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
      await this.aiCallRepository.save(aiCall);
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
      const { callSid: twilioCallSid } = await this.twilioService.createOutboundCall(
        dto.phoneNumber,
        publicBaseUrl,
        aiCall.id,
      );
      aiCall.twilioCallSid = twilioCallSid;
      aiCall.startedAt = new Date();
      await this.aiCallRepository.save(aiCall);

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
      await this.aiCallRepository.save(aiCall);

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

    const aiCall = await this.aiCallRepository.findOne({
      where: { id: callId },
    });
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

    const publicBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');
    const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${aiCall.id}`;

    // TURN 1: Call Connected — ask for Language preference first
    if (aiCall.currentTurn === 0 && !speechResult && !digits && !defaultLang) {
      aiCall.currentTurn = 1;
      await this.aiCallRepository.save(aiCall);
      void this.logCallEvent({
        callId: aiCall.id,
        twilioCallSid: aiCall.twilioCallSid,
        patientId: aiCall.patientId,
        assignmentsId: aiCall.assignmentsId,
        eventType: 'CALL_CONNECTED',
        level: 'INFO',
        message: 'Turn 1: Playing bilingual language selection prompt',
      });
      return this.twilioService.generateLanguageSelectionTwiML(actionUrl);
    }

    const digitsInput = (digits || '').trim();
    const speechLower = (speechResult || '').toLowerCase().trim();
    const parsedConfidence =
      confidence !== undefined && confidence !== null
        ? parseFloat(confidence.toString())
        : 1.0;

    const isPhantomNoise =
      !digitsInput &&
      speechResult &&
      !isNaN(parsedConfidence) &&
      parsedConfidence < 0.3;

    if (isPhantomNoise) {
      this.logger.warn(
        `[handleVoiceWebhook] ⚠️ Phantom acoustic noise discarded (confidence=${confidence}, text="${speechResult}").`,
      );
      void this.logCallEvent({
        callId: aiCall.id,
        twilioCallSid: aiCall.twilioCallSid,
        patientId: aiCall.patientId,
        assignmentsId: aiCall.assignmentsId,
        eventType: 'PHANTOM_NOISE',
        level: 'WARN',
        message: `Discarded low-confidence speech (${confidence})`,
        details: { speechResult, confidence, currentTurn: aiCall.currentTurn },
      });

      if (aiCall.currentTurn <= 1) {
        return this.twilioService.generateLanguageSelectionTwiML(actionUrl);
      }
      const lastAiMessage = [...aiCall.transcript]
        .reverse()
        .find((msg) => msg.role === 'assistant');
      if (lastAiMessage?.content) {
        return this.twilioService.generateGatherTwiML(
          lastAiMessage.content,
          actionUrl,
          aiCall.language,
        );
      }
      const silentRegather =
        aiCall.language === 'fr'
          ? 'Désolée, pouvez-vous répéter?'
          : 'Sorry, could you repeat that please?';
      return this.twilioService.generateGatherTwiML(
        silentRegather,
        actionUrl,
        aiCall.language,
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
      await this.aiCallRepository.save(aiCall);
      this.agentService.clearContextCache(aiCall.id);
      void this.logCallEvent({
        callId: aiCall.id,
        twilioCallSid: aiCall.twilioCallSid,
        patientId: aiCall.patientId,
        assignmentsId: aiCall.assignmentsId,
        eventType: 'MAX_TURNS_REACHED',
        level: 'WARN',
        message: `Call ended after exceeding MAX_CALL_TURNS (${MAX_CALL_TURNS})`,
      });
      return this.twilioService.generateTwiML(maxTurnMsg, aiCall.language);
    }

    let detectedLanguage = aiCall.language || 'en';
    let userIntent = '';

    const cleanedGreeting = speechLower.replace(/[?.!,]/g, '').trim();
    const isEnGreetingWord = ['hello', 'hi', 'hey', 'yes', 'yeah', 'yep', 'sure', 'okay', 'ok'].includes(
      cleanedGreeting,
    );
    const isFrGreetingWord = ['bonjour', 'allô', 'allo', 'oui', 'salut'].includes(cleanedGreeting);

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

    let userMessage = '';
    if (userIntent) {
      userMessage = userIntent;
    } else if (aiCall.currentTurn === 2) {
      userMessage = 'LANGUAGE_SELECTED';
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
        },
      });
    } else if (speechResult) {
      userMessage = speechResult;
    } else {
      userMessage = 'HELLO';
    }

    if (speechResult || userIntent) {
      aiCall.transcript.push({
        role: 'user',
        content: speechResult || userIntent,
        timestamp: new Date().toISOString(),
      });
    }

    const conversationHistory = this.deserializeHistory(aiCall.conversationHistory || []);

    // Run agent + DB update without redundant pre-save/re-fetch round-trips
    this.pendingResponses.set(callId, null);
    const agentPromise = this.processAgentAsync(
      aiCall,
      userMessage,
      conversationHistory,
      publicBaseUrl,
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
    return this.twilioService.generateHoldTwiML(pollUrl, aiCall.language);
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

      if (result.isComplete) {
        const finalOutcome =
          result.actionResult === 'CONFIRMED'
            ? CallOutcome.CONFIRMED
            : result.actionResult === 'CANCELLED'
              ? CallOutcome.CANCELLED
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
          }
        }

        aiCall.status = CallStatus.COMPLETED;
        aiCall.endedAt = new Date();
        aiCall.pendingAction = null;
        this.agentService.clearContextCache(callId);

        this.logger.log(`[processAgentAsync] 📞 Call COMPLETE — outcome=${aiCall.outcome}`);
        twiml = this.twilioService.generateTwiML(responseTextToSpeak, aiCall.language);
      } else {
        const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${aiCall.id}`;
        twiml = this.twilioService.generateGatherTwiML(
          responseTextToSpeak,
          actionUrl,
          aiCall.language,
          result.sttHints,
        );
      }

      await this.aiCallRepository.save(aiCall);
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
      await this.aiCallRepository.save(aiCall).catch(() => undefined);
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
      const fallback = this.twilioService.generateTwiML(fallbackMsg, aiCall.language);
      this.pendingResponses.set(callId, fallback);
    }
  }

  /**
   * Atomically marks physician_patient_slots.status = 2 (booked) inside a DB transaction
   * and inserts a row into patient_appointment_bookings.
   */
  private async bookConfirmedSlot(
    aiCall: AiCall,
  ): Promise<{ booked: boolean; bookingId?: string; reason?: string }> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const slotRepo = manager.getRepository(PhysicianPatientSlot);
        const bookingRepo = manager.getRepository(PatientAppointmentBooking);

        const slot = await slotRepo.findOne({
          where: { id: aiCall.slotId },
          lock: { mode: 'pessimistic_write' },
        });

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

        const existingBooking = await bookingRepo.findOne({
          where: { patientSlotId: slot.id },
        });

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

        slot.status = 2;
        await slotRepo.save(slot);

        const booking = bookingRepo.create({
          patientId: aiCall.patientId,
          clinicId: aiCall.clinicId,
          physicianProfileId: slot.physicianProfileId,
          patientSlotId: slot.id,
          appointmentDate: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: 1,
          bookedBy: 1,
          patientNote: `Confirmed via AI call ${aiCall.id}`,
        });
        await bookingRepo.save(booking);

        this.logger.log(
          `[bookConfirmedSlot] ✅ Slot ${slot.id} marked status=2 and booking ${booking.id} created.`,
        );
        await this.logCallEvent({
          callId: aiCall.id,
          twilioCallSid: aiCall.twilioCallSid,
          patientId: aiCall.patientId,
          assignmentsId: aiCall.assignmentsId,
          eventType: 'BOOKING_CONFIRMED',
          level: 'INFO',
          message: `Slot ${slot.id} booked (${slot.date} ${slot.startTime}-${slot.endTime}), bookingId=${booking.id}`,
          details: {
            slotId: slot.id,
            bookingId: booking.id,
            appointmentDate: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
          },
        });

        return { booked: true, bookingId: booking.id };
      });
    } catch (error: any) {
      this.logger.error(`Error in bookConfirmedSlot for callId=${aiCall.id}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async handlePollWebhook(callId: string): Promise<string> {
    try {
      const publicBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');

      if (!this.pendingResponses.has(callId)) {
        await this.logCallEvent({
          callId,
          eventType: 'ERROR',
          level: 'ERROR',
          message: `Poll webhook called for callId=${callId} with no pending response`,
        });
        return this.twilioService.generateTwiML(
          'An error occurred. Please call the clinic directly. Goodbye.',
          'en',
        );
      }

      const twiml = this.pendingResponses.get(callId);
      if (twiml === null) {
        const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
        return this.twilioService.generatePollWaitTwiML(pollUrl);
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
      const aiCall = await this.aiCallRepository.findOne({
        where: { twilioCallSid: body.CallSid },
      });
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
        this.agentService.clearContextCache(aiCall.id);
      }

      const isErrorStatus = ['busy', 'failed', 'no-answer', 'canceled'].includes(body.CallStatus);
      if (isErrorStatus && body.ErrorMessage) {
        aiCall.lastError = body.ErrorMessage;
      }

      await this.aiCallRepository.save(aiCall);
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
      const aiCall = await this.aiCallRepository.findOne({ where: { id } });
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
      const aiCall = await this.aiCallRepository.findOne({ where: { id } });
      if (!aiCall) {
        throw new NotFoundException(`AiCall with id ${id} not found`);
      }
      return {
        callId: id,
        transcript: aiCall.transcript,
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
      const aiCall = await this.aiCallRepository.findOne({ where: { id } });
      if (!aiCall) {
        throw new NotFoundException(`AiCall with id ${id} not found`);
      }
      const logs = await this.aiCallLogRepository.find({
        where: { callId: id },
        order: { createdAt: 'ASC' },
      });
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
