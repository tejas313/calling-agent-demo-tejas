import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import dayjs from "dayjs";
import {
  AiCall,
  ConversationMessage,
  PatientAppointmentBooking,
  PatientProfile,
  PhysicianClinicProfile,
  PhysicianPatientSlot,
  TriageAssignment,
} from "../entities";
import { StartCallDto } from "./dto/start-call.dto";
import { TwilioService } from "../twilio/twilio.service";
import { AgentService } from "../langchain/agent/agent.service";
import { CallStatus, CallOutcome, MAX_CALL_TURNS } from "../common/constants";

@Injectable()
export class AiCallService {
  private readonly logger = new Logger(AiCallService.name);
  private readonly pendingResponses = new Map<string, string | null>();

  constructor(
    @InjectRepository(AiCall)
    private readonly aiCallRepository: Repository<AiCall>,
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
    private readonly twilioService: TwilioService,
    private readonly agentService: AgentService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initiates an outbound AI call:
   * 1. Validates phone number in E.164 format.
   * 2. Looks up patient_profiles using patientId.
   * 3. Looks up triage_assignments using assignmentsId to read approvedDate, scheduleCount, scheduleUnit (1=days, 2=weeks, 3=months).
   * 4. Verifies physician_clinic_profiles for clinicId & assigned_physician_id.
   * 5. Queries physician_patient_slots for the first available slot (status = 1) on/after approvedDate + scheduleCount * scheduleUnit.
   * 6. Creates the AiCall record and places the Twilio call (unless testMode is true).
   */
  async startCall(dto: StartCallDto): Promise<{
    success: boolean;
    callId: string;
    twilioCallSid: string;
    status: string;
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
    if (!isValidPhoneNumber(dto.phoneNumber)) {
      this.logger.warn(`Invalid phone number provided: ${dto.phoneNumber}`);
      throw new BadRequestException(
        `Invalid phone number format "${dto.phoneNumber}". Please provide a valid international number in E.164 format (e.g. +14165551234).`,
      );
    }

    const parsedNumber = parsePhoneNumber(dto.phoneNumber);
    dto.phoneNumber = parsedNumber.format("E.164");

    // 1. Find patient in patient_profiles
    const patient = await this.patientProfileRepository.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException(`Patient profile with ID ${dto.patientId} not found`);
    }

    // 2. Find triage assignment in triage_assignments
    const assignment = await this.triageAssignmentRepository.findOne({
      where: { id: dto.assignmentsId },
    });
    if (!assignment) {
      throw new NotFoundException(`Triage assignment with ID ${dto.assignmentsId} not found`);
    }

    // 3. Determine and verify physician in physician_clinic_profiles
    const physicianId = dto.assigned_physician_id || assignment.assignedPhysicianId;
    if (!physicianId) {
      throw new BadRequestException(
        "assigned_physician_id is required (not found in request or triage_assignments)",
      );
    }

    const physicianProfile = await this.physicianClinicProfileRepository.findOne({
      where: { id: physicianId, clinicId: dto.clinicId },
    });
    if (!physicianProfile) {
      throw new NotFoundException(
        `Physician profile ${physicianId} not found for clinic ${dto.clinicId}`,
      );
    }

    // 4. Calculate minimum eligible slot date from approvedDate + scheduleCount * scheduleUnit
    // scheduleUnit: 1 = days, 2 = weeks, 3 = months
    const baseDate = assignment.approvedDate ? dayjs(assignment.approvedDate) : dayjs();
    const count = assignment.scheduleCount || 0;
    const unitMap: Record<number, "day" | "week" | "month"> = {
      1: "day",
      2: "week",
      3: "month",
    };
    const unit = unitMap[assignment.scheduleUnit || 1] || "day";
    const targetDate = count > 0
      ? baseDate.add(count, unit).format("YYYY-MM-DD")
      : baseDate.format("YYYY-MM-DD");

    this.logger.log(
      `[Slot Lookup] patientId=${dto.patientId}, clinicId=${dto.clinicId}, physicianId=${physicianId}, approvedDate=${baseDate.format("YYYY-MM-DD")}, scheduleCount=${count}, scheduleUnit=${assignment.scheduleUnit}, targetDate=${targetDate}`,
    );

    // 5. Fetch first available slot in physician_patient_slots with status = 1 and date >= targetDate
    const availableSlot = await this.physicianPatientSlotRepository
      .createQueryBuilder("slot")
      .where("slot.clinic_id = :clinicId", { clinicId: dto.clinicId })
      .andWhere("slot.physician_profile_id = :physicianId", { physicianId })
      .andWhere("slot.status = :status", { status: 1 })
      .andWhere("slot.date >= :targetDate", { targetDate })
      .orderBy("slot.date", "ASC")
      .addOrderBy("slot.startTime", "ASC")
      .getOne();

    if (!availableSlot) {
      throw new NotFoundException(
        `No available slot (status=1) found for physician ${physicianId} in clinic ${dto.clinicId} on or after ${targetDate}`,
      );
    }

    this.logger.log(
      `[Slot Found] slotId=${availableSlot.id}, date=${availableSlot.date}, time=${availableSlot.startTime}-${availableSlot.endTime}`,
    );

    const aiCall = this.aiCallRepository.create({
      patientId: dto.patientId,
      clinicId: dto.clinicId,
      assignmentsId: dto.assignmentsId,
      assignedPhysicianId: physicianId,
      slotId: availableSlot.id,
      appointmentId: dto.assignmentsId,
      phoneNumber: dto.phoneNumber,
      language: dto.language || "en",
      callType: dto.callType,
      status: CallStatus.INITIATED,
      currentTurn: 0,
      transcript: [],
      conversationHistory: [],
    });

    await this.aiCallRepository.save(aiCall);

    const publicBaseUrl = this.configService.get<string>("PUBLIC_BASE_URL");
    if (!publicBaseUrl) {
      throw new Error("PUBLIC_BASE_URL is not configured");
    }

    const slotSummary = {
      id: availableSlot.id,
      date: availableSlot.date,
      startTime: availableSlot.startTime,
      endTime: availableSlot.endTime,
    };

    if (dto.testMode) {
      aiCall.twilioCallSid = "TEST-MODE-NO-CALL";
      aiCall.startedAt = new Date();
      await this.aiCallRepository.save(aiCall);
      this.logger.warn(
        `[TEST MODE] Skipping real Twilio call. Trigger manually: POST /ai-call/twilio/voice?callId=${aiCall.id}`,
      );
      return {
        success: true,
        callId: aiCall.id,
        twilioCallSid: "TEST-MODE-NO-CALL",
        status: "initiated",
        slot: slotSummary,
        testMode: true,
        webhookUrl: `POST /ai-call/twilio/voice?callId=${aiCall.id}`,
        hint: 'Send { "SpeechResult": "English" } or { "Digits": "1" } to select language and start',
      };
    }

    try {
      const { callSid: twilioCallSid } =
        await this.twilioService.createOutboundCall(
          dto.phoneNumber,
          publicBaseUrl,
          aiCall.id,
        );
      aiCall.twilioCallSid = twilioCallSid;
      aiCall.startedAt = new Date();
      await this.aiCallRepository.save(aiCall);

      return {
        success: true,
        callId: aiCall.id,
        twilioCallSid,
        status: "initiated",
        slot: slotSummary,
      };
    } catch (error: any) {
      aiCall.status = CallStatus.FAILED;
      await this.aiCallRepository.save(aiCall);

      this.logger.error(
        `Twilio Error Code: ${error?.code}, Message: ${error?.message}`,
      );

      const msg: string = error?.message || "";
      if (
        msg.includes("verified") ||
        msg.includes("not assigned for voice calls")
      ) {
        throw new InternalServerErrorException(
          `Twilio Trial Account Restriction: The number "${dto.phoneNumber}" is not verified. ` +
            `Go to https://console.twilio.com/us1/develop/phone-numbers/manage/verified and add this number as a Verified Caller ID before making calls.`,
        );
      }

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
    this.logger.log(
      `[handleVoiceWebhook] ▶ callId=${callId}, callSid=${callSid}, speechResult="${speechResult}", digits="${digits}", confidence="${confidence}", defaultLang="${defaultLang}"`,
    );

    const aiCall = await this.aiCallRepository.findOne({
      where: { id: callId },
    });
    if (!aiCall) {
      throw new NotFoundException(`AiCall with id ${callId} not found`);
    }

    if (aiCall.status !== CallStatus.IN_PROGRESS) {
      aiCall.status = CallStatus.IN_PROGRESS;
    }
    if (!aiCall.twilioCallSid) {
      aiCall.twilioCallSid = callSid;
    }

    const publicBaseUrl = this.configService.get<string>("PUBLIC_BASE_URL");
    const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${aiCall.id}`;

    // TURN 1: Call Connected — ask for Language preference first (bilingual prompt)
    if (aiCall.currentTurn === 0 && !speechResult && !digits) {
      aiCall.currentTurn = 1;
      await this.aiCallRepository.save(aiCall);
      return this.twilioService.generateLanguageSelectionTwiML(actionUrl);
    }

    const digitsInput = (digits || "").trim();
    const speechLower = (speechResult || "").toLowerCase().trim();
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
      if (aiCall.currentTurn <= 1) {
        return this.twilioService.generateLanguageSelectionTwiML(actionUrl);
      }
      const lastAiMessage = [...aiCall.transcript]
        .reverse()
        .find((msg) => msg.role === "assistant");
      if (lastAiMessage?.content) {
        return this.twilioService.generateGatherTwiML(
          lastAiMessage.content,
          actionUrl,
          aiCall.language,
        );
      }
      const silentRegather =
        aiCall.language === "fr"
          ? "Désolée, pouvez-vous répéter?"
          : "Sorry, could you repeat that please?";
      return this.twilioService.generateGatherTwiML(
        silentRegather,
        actionUrl,
        aiCall.language,
      );
    }

    aiCall.currentTurn += 1;
    if (aiCall.currentTurn > MAX_CALL_TURNS) {
      const maxTurnMsg =
        aiCall.language === "fr"
          ? "Je suis désolée, nous avons atteint la durée maximale d'appel. Veuillez contacter directement la clinique. Au revoir."
          : "I'm sorry, but we have reached the maximum conversation length. Please call the clinic directly. Goodbye.";
      return this.twilioService.generateTwiML(maxTurnMsg, aiCall.language);
    }

    let detectedLanguage = aiCall.language || "en";
    let userIntent = "";

    const isGreetingWord = [
      "hello", "hi", "hey", "yes", "yeah", "yep", "sure", "okay", "ok",
      "bonjour", "allô", "allo", "oui",
    ].includes(speechLower.replace(/[?.!,]/g, "").trim());

    if (defaultLang === "en") {
      detectedLanguage = "en";
    } else if (
      digitsInput === "1" ||
      speechLower === "english" ||
      speechLower.includes("english") ||
      speechLower === "anglais" ||
      speechLower === "one"
    ) {
      detectedLanguage = "en";
    } else if (
      digitsInput === "2" ||
      speechLower === "french" ||
      speechLower.includes("french") ||
      speechLower === "français" ||
      speechLower === "francais" ||
      speechLower === "deux" ||
      speechLower === "two"
    ) {
      detectedLanguage = "fr";
    } else if (aiCall.currentTurn === 2 && isGreetingWord) {
      detectedLanguage = "en";
    } else if (this.isLikelyFrench(speechLower)) {
      detectedLanguage = "fr";
      userIntent = speechResult || "";
    } else if (speechResult) {
      userIntent = speechResult;
    }

    if (aiCall.currentTurn > 2 && digitsInput) {
      if (digitsInput === "1") {
        userIntent =
          aiCall.language === "fr"
            ? "Je confirme mon rendez-vous."
            : "I would like to confirm my appointment.";
      } else if (digitsInput === "2") {
        userIntent =
          aiCall.language === "fr"
            ? "Je souhaite reporter mon rendez-vous."
            : "I would like to reschedule my appointment.";
      } else if (digitsInput === "3") {
        userIntent =
          aiCall.language === "fr"
            ? "Je souhaite annuler mon rendez-vous."
            : "I would like to cancel my appointment.";
      }
    }

    aiCall.language = detectedLanguage;

    let userMessage = "";
    if (userIntent) {
      userMessage = userIntent;
    } else if (aiCall.currentTurn === 2) {
      userMessage = "LANGUAGE_SELECTED";
    } else if (speechResult) {
      userMessage = speechResult;
    } else {
      userMessage = "HELLO";
    }

    if (speechResult || userIntent) {
      aiCall.transcript.push({
        role: "user",
        content: speechResult || userIntent,
        timestamp: new Date().toISOString(),
      });
    }

    const conversationHistory = this.deserializeHistory(
      aiCall.conversationHistory || [],
    );

    await this.aiCallRepository.save(aiCall);

    this.pendingResponses.set(callId, null);
    const agentPromise = this.processAgentAsync(
      aiCall,
      userMessage,
      conversationHistory,
      publicBaseUrl,
    );

    const timeoutPromise = new Promise<"TIMEOUT">((resolve) =>
      setTimeout(() => resolve("TIMEOUT"), 4500),
    );
    const winner = await Promise.race([
      agentPromise.then(() => "DONE"),
      timeoutPromise,
    ]);

    if (winner === "DONE") {
      const directTwiml = this.pendingResponses.get(callId);
      if (directTwiml) {
        this.pendingResponses.delete(callId);
        return directTwiml;
      }
    }

    const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
    const holdSay =
      aiCall.language === "fr"
        ? '<Say voice="Polly.Lea-Neural" language="fr-FR">Un instant s\'il vous plaît, je vérifie pour vous.</Say>'
        : '<Say voice="Polly.Danielle-Neural" language="en-US">One moment please, checking that for you.</Say>';
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${holdSay}<Pause length="1"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
  }

  private isLikelyFrench(text: string): boolean {
    const frenchWords = [
      "bonjour", "oui", "non", "merci", "rendez-vous", "annuler", "confirmer",
      "reporter", "demain", "salut", "plaît", "plait", "docteur", "suis",
      "horaire", "heure", "matin", "soir",
    ];
    return frenchWords.some((word) => text.includes(word));
  }

  private async processAgentAsync(
    aiCall: AiCall,
    userMessage: string,
    conversationHistory: BaseMessage[],
    publicBaseUrl: string,
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
      });

      const freshCall = await this.aiCallRepository.findOne({
        where: { id: callId },
      });
      if (!freshCall) {
        const errMsg =
          aiCall.language === "fr"
            ? "Une erreur s'est produite. Veuillez appeler la clinique directement. Au revoir."
            : "An error occurred. Please call the clinic directly. Goodbye.";
        this.pendingResponses.set(
          callId,
          this.twilioService.generateTwiML(errMsg, aiCall.language),
        );
        return;
      }

      freshCall.transcript.push({
        role: "assistant",
        content: result.response,
        timestamp: new Date().toISOString(),
      });
      freshCall.conversationHistory = this.serializeHistory(result.updatedHistory);

      let twiml: string;
      if (result.isComplete) {
        const finalOutcome =
          result.actionResult === "CONFIRMED"
            ? CallOutcome.CONFIRMED
            : result.actionResult === "CANCELLED"
              ? CallOutcome.CANCELLED
              : this.detectOutcome(result.response);

        freshCall.outcome = finalOutcome;
        freshCall.status = CallStatus.COMPLETED;
        freshCall.endedAt = new Date();

        // If confirmed, mark slot status = 2 and create booking in patient_appointment_bookings
        if (finalOutcome === CallOutcome.CONFIRMED && freshCall.slotId) {
          await this.bookConfirmedSlot(freshCall);
        }

        this.logger.log(
          `[processAgentAsync] 📞 Call COMPLETE — outcome=${freshCall.outcome}`,
        );
        twiml = this.twilioService.generateTwiML(
          result.response,
          freshCall.language,
        );
      } else {
        const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${freshCall.id}`;
        twiml = this.twilioService.generateGatherTwiML(
          result.response,
          actionUrl,
          freshCall.language,
        );
      }

      await this.aiCallRepository.save(freshCall);
      this.pendingResponses.set(callId, twiml);
    } catch (error: any) {
      this.logger.error(
        `[processAgentAsync] ❌ Error for callId=${callId}: ${error?.name} — ${error?.message}`,
      );
      const fallbackMsg =
        aiCall.language === "fr"
          ? "Nous éprouvons des difficultés techniques. Veuillez appeler la clinique directement. Au revoir."
          : "We are experiencing technical difficulties. Please call the clinic directly. Goodbye.";
      const fallback = this.twilioService.generateTwiML(
        fallbackMsg,
        aiCall.language,
      );
      this.pendingResponses.set(callId, fallback);
    }
  }

  /**
   * Marks the physician_patient_slots row as status = 2 (booked)
   * and inserts a new appointment into patient_appointment_bookings.
   */
  private async bookConfirmedSlot(aiCall: AiCall): Promise<void> {
    const slot = await this.physicianPatientSlotRepository.findOne({
      where: { id: aiCall.slotId },
    });
    if (!slot) {
      this.logger.warn(`[bookConfirmedSlot] Slot ${aiCall.slotId} not found.`);
      return;
    }

    if (slot.status !== 2) {
      slot.status = 2;
      await this.physicianPatientSlotRepository.save(slot);
    }

    const existingBooking = await this.bookingRepository.findOne({
      where: { patientSlotId: slot.id },
    });

    if (!existingBooking) {
      const booking = this.bookingRepository.create({
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
      await this.bookingRepository.save(booking);
      this.logger.log(
        `[bookConfirmedSlot] ✅ Slot ${slot.id} marked status=2 and booking ${booking.id} created in patient_appointment_bookings.`,
      );
    }
  }

  async handlePollWebhook(callId: string): Promise<string> {
    const publicBaseUrl = this.configService.get<string>("PUBLIC_BASE_URL");

    if (!this.pendingResponses.has(callId)) {
      return this.twilioService.generateTwiML(
        "An error occurred. Please call the clinic directly. Goodbye.",
        "en",
      );
    }

    const twiml = this.pendingResponses.get(callId);
    if (twiml === null) {
      const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
    }

    this.pendingResponses.delete(callId);
    return twiml;
  }

  async handleStatusCallback(body: any): Promise<void> {
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
      "no-answer": CallStatus.NO_ANSWER,
      canceled: CallStatus.FAILED,
    };

    const newStatus = statusMap[body.CallStatus];
    if (newStatus && aiCall.status !== CallStatus.COMPLETED) {
      aiCall.status = newStatus;
    }

    if (body.CallStatus === "completed") {
      aiCall.status = CallStatus.COMPLETED;
      aiCall.endedAt = new Date();
      if (body.CallDuration) {
        aiCall.duration = parseInt(body.CallDuration, 10);
      }
    }

    await this.aiCallRepository.save(aiCall);
  }

  async getCall(id: string): Promise<AiCall> {
    const aiCall = await this.aiCallRepository.findOne({ where: { id } });
    if (!aiCall) {
      throw new NotFoundException(`AiCall with id ${id} not found`);
    }
    const { conversationHistory: _conversationHistory, ...safeCall } = aiCall;
    return safeCall as AiCall;
  }

  async getTranscript(id: string): Promise<{
    callId: string;
    transcript: ConversationMessage[];
    status: string;
    outcome: string | null;
  }> {
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
  }

  private serializeHistory(history: BaseMessage[]): any[] {
    return history.map((msg) => ({
      _getType: msg._getType(),
      content: msg.content,
    }));
  }

  private deserializeHistory(stored: any[]): BaseMessage[] {
    return stored.map((msg) => {
      if (msg._getType === "human") return new HumanMessage(msg.content);
      if (msg._getType === "ai") return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    });
  }

  private detectOutcome(responseText: string): CallOutcome {
    const text = responseText.toLowerCase();
    if (text.includes("confirm") || text.includes("confirmé") || text.includes("confirme")) return CallOutcome.CONFIRMED;
    if (text.includes("cancel") || text.includes("annul")) return CallOutcome.CANCELLED;
    if (text.includes("reschedule") || text.includes("report") || text.includes("déplacé")) return CallOutcome.RESCHEDULED;
    if (text.includes("call you back") || text.includes("rappeller") || text.includes("rappeler")) return CallOutcome.CALL_LATER;
    return CallOutcome.UNKNOWN;
  }
}
