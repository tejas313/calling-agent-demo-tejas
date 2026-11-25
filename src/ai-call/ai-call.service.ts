import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { AiCall, ConversationMessage, TranscriptEntry } from './entities/ai-call.entity';
import { StartCallDto } from './dto/start-call.dto';
import { TwilioService } from '../twilio/twilio.service';
import { AgentService } from '../langchain/agent/agent.service';
import { PatientsService } from '../patients/patients.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { ClinicsService } from '../clinics/clinics.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import {
  CallStatus,
  CallOutcome,
  CallDirection,
  CommunicationMethod,
  MAX_CALL_TURNS,
} from '../common/constants';

@Injectable()
export class AiCallService {
  private readonly logger = new Logger(AiCallService.name);
  private readonly pendingResponses = new Map<string, string | null>();

  constructor(
    @InjectRepository(AiCall)
    private readonly aiCallRepository: Repository<AiCall>,
    private readonly twilioService: TwilioService,
    private readonly agentService: AgentService,
    private readonly configService: ConfigService,
    private readonly patientsService: PatientsService,
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService: AppointmentsService,
    private readonly clinicsService: ClinicsService,
    private readonly waitlistService: WaitlistService,
  ) {}

  /**
   * Initiates an outbound AI call.
   * Uses clinic-specific Twilio credentials and phone numbers.
   */
  async startCall(dto: StartCallDto): Promise<{
    success: boolean;
    callId: string;
    twilioCallSid: string;
    status: string;
    testMode?: boolean;
    webhookUrl?: string;
    hint?: string;
  }> {
    if (!isValidPhoneNumber(dto.phoneNumber)) {
      this.logger.warn(`Invalid phone number provided: ${dto.phoneNumber}`);
      throw new BadRequestException(
        `Invalid phone number format "${dto.phoneNumber}". Please provide a valid international number in E.164 format.`,
      );
    }

    const parsedNumber = parsePhoneNumber(dto.phoneNumber);
    dto.phoneNumber = parsedNumber.format('E.164');

    const aiCall = this.aiCallRepository.create({
      ...dto,
      direction: CallDirection.OUTBOUND,
      status: CallStatus.INITIATED,
      currentTurn: 0,
      transcript: [],
      conversationHistory: [],
    });

    await this.aiCallRepository.save(aiCall);

    const publicBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');
    if (!publicBaseUrl) {
      throw new Error('PUBLIC_BASE_URL is not configured');
    }

    // Chart entry
    await this.patientsService.logCommunication({
      patientId: dto.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: false,
      interactionReason: 'Outbound Appointment Call Initiated',
      aiActions: `Initiating call to ${dto.phoneNumber} for appointment ${dto.appointmentId}.`,
      finalAction: 'Call Initiated',
      finalWorkflowStatus: 'Contact Attempt 1',
    });

    // TEST MODE
    if (dto.testMode) {
      aiCall.twilioCallSid = 'TEST-MODE-NO-CALL';
      aiCall.startedAt = new Date();
      await this.aiCallRepository.save(aiCall);
      return {
        success: true,
        callId: aiCall.id,
        twilioCallSid: 'TEST-MODE-NO-CALL',
        status: 'initiated',
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
        dto.clinicId,
      );
      aiCall.twilioCallSid = twilioCallSid;
      aiCall.startedAt = new Date();
      await this.aiCallRepository.save(aiCall);

      return {
        success: true,
        callId: aiCall.id,
        twilioCallSid,
        status: 'initiated',
      };
    } catch (error: any) {
      aiCall.status = CallStatus.FAILED;
      await this.aiCallRepository.save(aiCall);
      this.logger.error(`Twilio Error Code: ${error?.code}, Message: ${error?.message}`);
      throw error;
    }
  }

  /**
   * Handles incoming phone call from a patient to a clinic's number.
   */
  async handleIncomingCall(
    fromNumber: string,
    toNumber: string,
    callSid: string,
  ): Promise<string> {
    this.logger.log(`[INCOMING CALL] From=${fromNumber}, To=${toNumber}, CallSid=${callSid}`);

    const clinic = await this.clinicsService.findByPhoneNumber(toNumber);
    const clinicId = clinic?.id || 'CLINIC-001';
    const clinicName = clinic?.name || 'our medical clinic';

    let patientId = 'PAT-INBOUND';
    let appointmentId = '';

    try {
      const matchedPatient = await this.patientsService.findByPhone(fromNumber);
      if (matchedPatient) {
        patientId = matchedPatient.id;
        const appts = await this.appointmentsService.findByPatient(matchedPatient.id);
        if (appts && appts.length > 0) {
          appointmentId = appts[0].id;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Inbound patient lookup note: ${err?.message}`);
    }

    const aiCall = this.aiCallRepository.create({
      patientId,
      appointmentId,
      clinicId,
      phoneNumber: fromNumber,
      twilioCallSid: callSid,
      direction: CallDirection.INBOUND,
      status: CallStatus.IN_PROGRESS,
      currentTurn: 0,
      transcript: [],
      conversationHistory: [],
      startedAt: new Date(),
    });

    await this.aiCallRepository.save(aiCall);

    if (patientId && patientId !== 'PAT-INBOUND') {
      await this.patientsService.logCommunication({
        patientId,
        communicationMethod: CommunicationMethod.PHONE,
        verified: false,
        interactionReason: 'Incoming Patient Call',
        aiActions: `Incoming call connected from ${fromNumber} to ${clinicName}.`,
        finalAction: 'Inbound Call Connected',
        finalWorkflowStatus: 'Inbound In Progress',
      });
    }

    const publicBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');
    const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${aiCall.id}`;

    return this.twilioService.generateIncomingCallTwiML(actionUrl, clinicName);
  }

  /**
   * Main Voice Webhook Handler.
   */
  async handleVoiceWebhook(
    callId: string,
    speechResult: string | undefined,
    callSid: string,
    digits?: string,
    confidence?: string | number,
    defaultLang?: string,
  ): Promise<string> {
    this.logger.log(
      `[handleVoiceWebhook] callId=${callId}, speech="${speechResult}", digits="${digits}", lang="${defaultLang}"`,
    );

    const aiCall = await this.aiCallRepository.findOne({ where: { id: callId } });
    if (!aiCall) {
      throw new NotFoundException(`AiCall with id ${callId} not found`);
    }

    if (aiCall.status !== CallStatus.IN_PROGRESS) {
      aiCall.status = CallStatus.IN_PROGRESS;
    }
    if (!aiCall.twilioCallSid) {
      aiCall.twilioCallSid = callSid;
    }

    const publicBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');
    const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${aiCall.id}`;

    // Turn 1: Present bilingual language prompt
    if (aiCall.currentTurn === 0 && !speechResult && !digits) {
      aiCall.currentTurn = 1;
      await this.aiCallRepository.save(aiCall);
      return this.twilioService.generateLanguageSelectionTwiML(actionUrl);
    }

    const digitsInput = (digits || '').trim();
    const speechLower = (speechResult || '').toLowerCase().trim();
    const parsedConfidence =
      confidence !== undefined && confidence !== null ? parseFloat(confidence.toString()) : 1.0;

    const isPhantomNoise =
      !digitsInput && speechResult && !isNaN(parsedConfidence) && parsedConfidence < 0.3;

    if (isPhantomNoise) {
      if (aiCall.currentTurn <= 1) {
        return this.twilioService.generateLanguageSelectionTwiML(actionUrl);
      }
      const silentRegather =
        aiCall.language === 'fr'
          ? 'Désolée, pouvez-vous répéter?'
          : 'Sorry, could you repeat that please?';
      return this.twilioService.generateGatherTwiML(silentRegather, actionUrl, aiCall.language);
    }

    aiCall.currentTurn += 1;

    if (aiCall.currentTurn > MAX_CALL_TURNS) {
      const maxTurnMsg =
        aiCall.language === 'fr'
          ? "Nous avons atteint la durée maximale d'appel. Veuillez appeler la clinique directement. Au revoir."
          : 'We have reached the maximum conversation length. Please call the clinic directly. Goodbye.';
      return this.twilioService.generateHangupTwiML(maxTurnMsg, aiCall.language);
    }

    let detectedLanguage = aiCall.language || 'en';
    let userIntent = '';

    const isGreetingWord = [
      'hello', 'hi', 'hey', 'yes', 'yeah', 'yep', 'sure', 'okay', 'ok',
      'bonjour', 'allô', 'allo', 'oui',
    ].includes(speechLower.replace(/[?.!,]/g, '').trim());

    if (defaultLang === 'en') {
      detectedLanguage = 'en';
    } else if (
      digitsInput === '1' ||
      speechLower === 'english' ||
      speechLower.includes('english') ||
      speechLower === 'anglais' ||
      speechLower === 'one'
    ) {
      detectedLanguage = 'en';
    } else if (
      digitsInput === '2' ||
      speechLower === 'french' ||
      speechLower.includes('french') ||
      speechLower === 'français' ||
      speechLower === 'francais' ||
      speechLower === 'deux' ||
      speechLower === 'two'
    ) {
      detectedLanguage = 'fr';
    } else if (aiCall.currentTurn === 2 && isGreetingWord) {
      detectedLanguage = 'en';
    } else if (this.isLikelyFrench(speechLower)) {
      detectedLanguage = 'fr';
      userIntent = speechResult || '';
    } else if (speechResult) {
      userIntent = speechResult;
    }

    // DTMF Keypad Fallbacks
    if (aiCall.currentTurn > 2 && digitsInput) {
      if (digitsInput === '1') {
        userIntent =
          aiCall.language === 'fr'
            ? 'Je confirme mon rendez-vous.'
            : 'I would like to confirm my appointment.';
      } else if (digitsInput === '2') {
        userIntent =
          aiCall.language === 'fr'
            ? 'Je souhaite reporter mon rendez-vous.'
            : 'I would like to reschedule my appointment.';
      } else if (digitsInput === '3') {
        userIntent =
          aiCall.language === 'fr'
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
    } else if (speechResult) {
      userMessage = speechResult;
    } else {
      userMessage = 'HELLO';
    }

    if (speechResult || userIntent) {
      const entry: TranscriptEntry = {
        role: 'patient',
        text: speechResult || userIntent,
        timestamp: new Date().toISOString(),
      };
      aiCall.transcript = [...(aiCall.transcript || []), entry];
    }

    const conversationHistory = this.deserializeHistory(aiCall.conversationHistory || []);
    await this.aiCallRepository.save(aiCall);

    this.pendingResponses.set(callId, null);
    const agentPromise = this.processAgentAsync(
      aiCall,
      userMessage,
      conversationHistory,
      publicBaseUrl,
    );

    const timeoutPromise = new Promise<'TIMEOUT'>((resolve) =>
      setTimeout(() => resolve('TIMEOUT'), 4500),
    );
    const winner = await Promise.race([agentPromise.then(() => 'DONE'), timeoutPromise]);

    if (winner === 'DONE') {
      const directTwiml = this.pendingResponses.get(callId);
      if (directTwiml) {
        this.pendingResponses.delete(callId);
        return directTwiml;
      }
    }

    const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
    const holdSay =
      aiCall.language === 'fr'
        ? '<Say voice="Polly.Lea-Neural" language="fr-FR">Un instant s\'il vous plaît, je vérifie pour vous.</Say>'
        : '<Say voice="Polly.Danielle-Neural" language="en-US">One moment please, checking that for you.</Say>';
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${holdSay}<Pause length="1"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
  }

  private isLikelyFrench(text: string): boolean {
    const frenchWords = [
      'bonjour', 'oui', 'non', 'merci', 'rendez-vous', 'annuler', 'confirmer',
      'reporter', 'demain', 'salut', 'plaît', 'plait', 'docteur', 'suis',
      'horaire', 'heure', 'matin', 'soir', 'français', 'francais',
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
        appointmentId: aiCall.appointmentId,
        clinicId: aiCall.clinicId,
        twilioCallSid: aiCall.twilioCallSid,
        language: aiCall.language,
        callType: aiCall.callType,
        userMessage,
        conversationHistory,
        phoneNumber: aiCall.phoneNumber,
      });

      const freshCall = await this.aiCallRepository.findOne({ where: { id: callId } });
      if (!freshCall) {
        const errMsg =
          aiCall.language === 'fr'
            ? "Une erreur s'est produite. Veuillez appeler la clinique directement. Au revoir."
            : 'An error occurred. Please call the clinic directly. Goodbye.';
        this.pendingResponses.set(
          callId,
          this.twilioService.generateHangupTwiML(errMsg, aiCall.language),
        );
        return;
      }

      const agentEntry: TranscriptEntry = {
        role: 'agent',
        text: result.response,
        timestamp: new Date().toISOString(),
      };
      freshCall.transcript = [...(freshCall.transcript || []), agentEntry];
      freshCall.conversationHistory = this.serializeHistory(result.updatedHistory);

      let twiml: string;
      if (result.isComplete) {
        freshCall.outcome = this.detectOutcome(result.response);
        freshCall.status = CallStatus.COMPLETED;
        freshCall.endedAt = new Date();

        // Perform final action side-effects
        await this.handleCallCompletionActions(freshCall);

        twiml = this.twilioService.generateHangupTwiML(result.response, freshCall.language);
      } else {
        const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${freshCall.id}`;
        twiml = this.twilioService.generateGatherTwiML(result.response, actionUrl, freshCall.language);
      }

      await this.aiCallRepository.save(freshCall);
      this.pendingResponses.set(callId, twiml);
    } catch (error: any) {
      this.logger.error(`[processAgentAsync] Error for callId=${callId}: ${error?.message}`);
      const fallbackMsg =
        aiCall.language === 'fr'
          ? 'Nous éprouvons des difficultés techniques. Veuillez appeler la clinique. Au revoir.'
          : 'We are experiencing technical difficulties. Please call the clinic directly. Goodbye.';
      this.pendingResponses.set(
        callId,
        this.twilioService.generateHangupTwiML(fallbackMsg, aiCall.language),
      );
    }
  }

  /**
   * Final side-effects upon call completion:
   * Confirms, cancels, or reschedules in DB, sends confirmation SMS, and logs to chart.
   */
  private async handleCallCompletionActions(call: AiCall): Promise<void> {
    if (!call.appointmentId || !call.patientId) return;

    try {
      if (call.outcome === CallOutcome.CONFIRMED) {
        await this.appointmentsService.confirm(call.appointmentId);
        const confirmMsg =
          call.language === 'fr'
            ? 'Votre rendez-vous a été confirmé avec succès. Merci d\'avoir choisi notre clinique.'
            : 'Your appointment has been successfully confirmed. Thank you for choosing our clinic.';
        await this.twilioService.sendSms(call.phoneNumber, confirmMsg, call.clinicId);
      } else if (call.outcome === CallOutcome.CANCELLED) {
        await this.appointmentsService.cancel(call.appointmentId, 'Patient cancelled during AI call');
        const cancelMsg =
          call.language === 'fr'
            ? 'Votre rendez-vous a été annulé selon votre demande. N\'hésitez pas à nous recontacter si besoin.'
            : 'Your appointment has been cancelled as requested. Please contact us if you need to reschedule.';
        await this.twilioService.sendSms(call.phoneNumber, cancelMsg, call.clinicId);
      }

      await this.patientsService.logCommunication({
        patientId: call.patientId,
        communicationMethod: CommunicationMethod.PHONE,
        verified: true,
        interactionReason: `Call Completed: ${call.callType}`,
        aiActions: `Call completed with outcome ${call.outcome}. Confirmation SMS dispatched.`,
        finalAction: `Call Outcome: ${call.outcome}`,
        finalWorkflowStatus: `Call ${call.outcome}`,
      });
    } catch (err: any) {
      this.logger.warn(`Completion side-effect note: ${err?.message}`);
    }
  }

  /**
   * Handles Inbound SMS from Patients (Scenario 19 & 20).
   */
  async handleIncomingSms(
    from: string,
    to: string,
    body: string,
    messageSid: string,
  ): Promise<{ responseText: string }> {
    this.logger.log(`[INCOMING SMS] From=${from}, To=${to}, Body="${body}", Sid=${messageSid}`);

    const clinic = await this.clinicsService.findByPhoneNumber(to);
    const clinicId = clinic?.id || 'CLINIC-001';
    const clinicName = clinic?.name || 'our medical clinic';

    const patient = await this.patientsService.findByPhone(from);
    if (!patient) {
      const genericReply = `Thank you for contacting ${clinicName}. We could not locate your phone number in our patient registry. Please contact our front desk directly.`;
      await this.twilioService.sendSms(from, genericReply, clinicId);
      return { responseText: genericReply };
    }

    const appts = await this.appointmentsService.findByPatient(patient.id);
    const upcomingAppt = appts.find((a) => a.status !== 'CANCELLED');

    const clean = body.trim().toUpperCase();
    let replyText = '';

    // Scenario 19: Patient replies YES to accept / confirm
    if (clean === 'YES' || clean === 'OUI' || clean === 'CONFIRM' || clean === '1') {
      if (upcomingAppt) {
        await this.appointmentsService.confirm(upcomingAppt.id);
        replyText =
          patient.language === 'fr'
            ? `Merci ${patient.name}. Votre rendez-vous du ${upcomingAppt.date} à ${upcomingAppt.time} est confirmé.`
            : `Thank you ${patient.name}. Your appointment on ${upcomingAppt.date} at ${upcomingAppt.time} is confirmed.`;
      } else {
        replyText = `Thank you ${patient.name}. Your confirmation has been received.`;
      }

      await this.patientsService.logCommunication({
        patientId: patient.id,
        communicationMethod: CommunicationMethod.SMS,
        verified: true,
        interactionReason: 'Patient SMS Confirmation',
        patientRequest: body,
        aiActions: 'Received YES via SMS. Confirmed appointment.',
        finalAction: 'Appointment Confirmed',
        finalWorkflowStatus: 'Appointment Confirmed',
      });
    }
    // Scenario 19: Patient replies NO to decline / cancel
    else if (clean === 'NO' || clean === 'NON' || clean === 'CANCEL' || clean === '2') {
      if (upcomingAppt) {
        await this.appointmentsService.cancel(upcomingAppt.id, 'Patient declined via SMS');
        replyText =
          patient.language === 'fr'
            ? `Votre rendez-vous a bien été annulé. Merci de nous avoir prévenus.`
            : `Your appointment has been cancelled as requested. Thank you for notifying us.`;
      } else {
        replyText = `Your decline response has been recorded.`;
      }

      await this.patientsService.logCommunication({
        patientId: patient.id,
        communicationMethod: CommunicationMethod.SMS,
        verified: true,
        interactionReason: 'Patient SMS Cancellation',
        patientRequest: body,
        aiActions: 'Received NO via SMS. Cancelled appointment and triggered waitlist backfill.',
        finalAction: 'Appointment Cancelled',
        finalWorkflowStatus: 'Appointment Cancelled',
      });
    }
    // Scenario 20: Ambiguous SMS response ("Maybe", "What time?", "Can I come later?")
    else {
      replyText =
        patient.language === 'fr'
          ? `Nous avons bien reçu: "${body}". Pour confirmer votre rendez-vous, répondez OUI. Pour annuler, répondez NON. Pour toute question, nous pouvons vous rappeler.`
          : `We received: "${body}". To confirm your appointment, please reply YES. To cancel, reply NO. Or let us know if you would like a phone call.`;

      await this.patientsService.logCommunication({
        patientId: patient.id,
        communicationMethod: CommunicationMethod.SMS,
        verified: true,
        interactionReason: 'Ambiguous SMS Response Received',
        patientRequest: body,
        aiActions: 'Ambiguous text interpreted. Sent clarifying question. Appointment remains unconfirmed.',
        finalAction: 'Clarification SMS Dispatched',
        finalWorkflowStatus: 'Awaiting Patient Confirmation',
      });
    }

    await this.twilioService.sendSms(from, replyText, clinicId);
    return { responseText: replyText };
  }

  async handlePollWebhook(callId: string): Promise<string> {
    const publicBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');

    if (!this.pendingResponses.has(callId)) {
      return this.twilioService.generateHangupTwiML(
        'An error occurred. Please call the clinic directly. Goodbye.',
        'en',
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

  /**
   * Twilio Status Callback:
   * Handles call states, and triggers Scenario 3 (Voicemail & SMS when unanswered).
   */
  async handleStatusCallback(body: any): Promise<void> {
    if (!body.CallSid) return;
    const aiCall = await this.aiCallRepository.findOne({ where: { twilioCallSid: body.CallSid } });
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

    // Scenario 3: Patient Does Not Answer – Voicemail and SMS Sent
    if (body.CallStatus === 'no-answer' || body.CallStatus === 'busy' || body.AnsweredBy === 'machine_start') {
      aiCall.status = CallStatus.AWAITING_RESPONSE;
      aiCall.outcome = CallOutcome.VOICEMAIL_LEFT;

      const clinic = await this.clinicsService.findById(aiCall.clinicId).catch(() => null);
      const clinicName = clinic?.name || 'our medical clinic';
      const clinicPhone = clinic?.phone || this.configService.get<string>('TWILIO_PHONE_NUMBER');

      const smsText =
        aiCall.language === 'fr'
          ? `Bonjour, ${clinicName} a tenté de vous joindre concernant votre rendez-vous. Répondez OUI pour confirmer, NON pour annuler, ou rappelez-nous au ${clinicPhone}.`
          : `Hello, ${clinicName} tried to reach you regarding your medical appointment. Reply YES to confirm, NO to decline, or call us back at ${clinicPhone}.`;

      await this.twilioService.sendSms(aiCall.phoneNumber, smsText, aiCall.clinicId);

      await this.patientsService.logCommunication({
        patientId: aiCall.patientId,
        communicationMethod: CommunicationMethod.VOICEMAIL,
        verified: false,
        interactionReason: 'Unanswered Outbound Call',
        aiActions: 'No answer received. Approved voicemail left and follow-up SMS dispatched.',
        finalAction: 'Voicemail & SMS Sent',
        finalWorkflowStatus: 'Awaiting Patient Response',
      });

      this.logger.log(`[Scenario 3] Voicemail and SMS sent for unanswered call ${aiCall.id}`);
    }

    if (body.CallStatus === 'completed') {
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
    transcript: TranscriptEntry[];
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
      if (msg._getType === 'human') return new HumanMessage(msg.content);
      if (msg._getType === 'ai') return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    });
  }

  private detectOutcome(responseText: string): CallOutcome {
    const text = responseText.toLowerCase();
    if (text.includes('confirm') || text.includes('confirmé') || text.includes('confirme'))
      return CallOutcome.CONFIRMED;
    if (text.includes('cancel') || text.includes('annul')) return CallOutcome.CANCELLED;
    if (text.includes('reschedule') || text.includes('report') || text.includes('déplacé'))
      return CallOutcome.RESCHEDULED;
    if (text.includes('call you back') || text.includes('rappeller') || text.includes('rappeler'))
      return CallOutcome.CALL_LATER;
    return CallOutcome.UNKNOWN;
  }
}
