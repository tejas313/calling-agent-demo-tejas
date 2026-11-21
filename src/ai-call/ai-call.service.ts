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
import { AiCall, ConversationMessage } from "./entities/ai-call.entity";
import { StartCallDto } from "./dto/start-call.dto";
import { TwilioService } from "../twilio/twilio.service";
import { AgentService } from "../langchain/agent/agent.service";
import { CallStatus, CallOutcome, MAX_CALL_TURNS } from "../common/constants";

@Injectable()
export class AiCallService {
  private readonly logger = new Logger(AiCallService.name);
  // In-memory store: callId -> TwiML string when ready, null while pending
  private readonly pendingResponses = new Map<string, string | null>();

  constructor(
    @InjectRepository(AiCall)
    private readonly aiCallRepository: Repository<AiCall>,
    private readonly twilioService: TwilioService,
    private readonly agentService: AgentService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initiates an outbound AI call.
   * Validates phone number format, creates the database record, and places the Twilio call.
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
    // Validate phone number format & type
    if (!isValidPhoneNumber(dto.phoneNumber)) {
      this.logger.warn(`Invalid phone number provided: ${dto.phoneNumber}`);
      throw new BadRequestException(
        `Invalid phone number format "${dto.phoneNumber}". Please provide a valid international number in E.164 format (e.g. +14165551234).`,
      );
    }

    const parsedNumber = parsePhoneNumber(dto.phoneNumber);
    this.logger.log(
      `[Phone Validation] Country=${parsedNumber.country}, Type=${parsedNumber.getType() || "UNKNOWN"}, E.164=${parsedNumber.format("E.164")}, National=${parsedNumber.formatNational()}`,
    );

    // Ensure phone number is in standardized E.164 format
    dto.phoneNumber = parsedNumber.format("E.164");

    const aiCall = this.aiCallRepository.create({
      ...dto,
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

    // TEST MODE: skip the real Twilio call, return callId for manual webhook testing
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
      };
    } catch (error: any) {
      aiCall.status = CallStatus.FAILED;
      await this.aiCallRepository.save(aiCall);

      // Log exact raw error from Twilio
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

  /**
   * Main Twilio Voice Webhook Handler.
   * Handles:
   * - Turn 1: Presents bilingual language prompt (English / French).
   * - Turn 2: Detects chosen language (speech or DTMF), sets language in DB, delivers greeting.
   * - Subsequent Turns: Runs conversational LLM reasoning with instant barge-in and validation.
   */
  async handleVoiceWebhook(
    callId: string,
    speechResult: string | undefined,
    callSid: string,
    digits?: string,
  ): Promise<string> {
    this.logger.log(
      `[handleVoiceWebhook] ▶ callId=${callId}, callSid=${callSid}, speechResult="${speechResult}", digits="${digits}"`,
    );

    const aiCall = await this.aiCallRepository.findOne({
      where: { id: callId },
    });
    if (!aiCall) {
      this.logger.error(
        `[handleVoiceWebhook] ❌ No AiCall record found for callId=${callId}`,
      );
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
      this.logger.log(
        `[handleVoiceWebhook] 🌐 Turn 1 connected — presenting language selection (English / French).`,
      );
      return this.twilioService.generateLanguageSelectionTwiML(actionUrl);
    }

    aiCall.currentTurn += 1;
    this.logger.log(
      `[handleVoiceWebhook] Turn #${aiCall.currentTurn} of max ${MAX_CALL_TURNS}`,
    );

    if (aiCall.currentTurn > MAX_CALL_TURNS) {
      this.logger.warn(
        `[handleVoiceWebhook] Max turns reached for callId=${callId}`,
      );
      const maxTurnMsg = aiCall.language === "fr"
        ? "Je suis désolée, nous avons atteint la durée maximale d'appel. Veuillez contacter directement la clinique. Au revoir."
        : "I'm sorry, but we have reached the maximum conversation length. Please call the clinic directly. Goodbye.";
      return this.twilioService.generateTwiML(maxTurnMsg, aiCall.language);
    }

    // Process language selection if on Turn 2 (or if user requested a language switch)
    const digitsInput = (digits || "").trim();
    const speechLower = (speechResult || "").toLowerCase().trim();

    let detectedLanguage = aiCall.language || "en";
    let userIntent = "";

    if (
      digitsInput === "1" ||
      speechLower === "english" ||
      speechLower.includes("english") ||
      speechLower === "anglais" ||
      speechLower === "one"
    ) {
      detectedLanguage = "en";
      this.logger.log(`[handleVoiceWebhook] 🇬🇧 Language selected: English (via ${digitsInput ? "DTMF 1" : "Speech"})`);
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
      this.logger.log(`[handleVoiceWebhook] 🇫🇷 Language selected: French (via ${digitsInput ? "DTMF 2" : "Speech"})`);
    } else if (this.isLikelyFrench(speechLower)) {
      detectedLanguage = "fr";
      userIntent = speechResult || "";
      this.logger.log(`[handleVoiceWebhook] 🇫🇷 Inferred French from utterance: "${speechResult}"`);
    } else if (speechResult) {
      userIntent = speechResult;
    }

    aiCall.language = detectedLanguage;

    let userMessage = "";
    if (userIntent) {
      userMessage = userIntent;
    } else if (aiCall.currentTurn === 2) {
      // Just chose language, proceed to appointment greeting
      userMessage = "LANGUAGE_SELECTED";
    } else if (speechResult) {
      userMessage = speechResult;
    } else {
      userMessage = "HELLO";
    }

    this.logger.log(`[handleVoiceWebhook] userMessage="${userMessage}", language=${aiCall.language}`);

    if (speechResult) {
      aiCall.transcript.push({
        role: "user",
        content: speechResult,
        timestamp: new Date().toISOString(),
      });
    }

    const conversationHistory = this.deserializeHistory(
      aiCall.conversationHistory || [],
    );

    // Save updated turn/status/language before going async
    await this.aiCallRepository.save(aiCall);

    // Mark this callId as pending and start agent
    this.pendingResponses.set(callId, null);
    const agentPromise = this.processAgentAsync(aiCall, userMessage, conversationHistory, publicBaseUrl);

    // Wait up to 4.5 seconds for agent to respond directly
    const timeoutPromise = new Promise<"TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), 4500));
    const winner = await Promise.race([agentPromise.then(() => "DONE"), timeoutPromise]);

    if (winner === "DONE") {
      const directTwiml = this.pendingResponses.get(callId);
      if (directTwiml) {
        this.logger.log(`[handleVoiceWebhook] ⚡ Direct response ready in <4.5s. Returning TwiML directly!`);
        this.pendingResponses.delete(callId);
        return directTwiml;
      }
    }

    // Agent is taking longer than 4.5s (e.g. multi-step tool calls):
    this.logger.log(`[handleVoiceWebhook] ⏳ Agent needs more time (>4.5s). Sending courteous hold message to Twilio.`);
    const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
    const holdSay = aiCall.language === "fr"
      ? '<Say voice="Polly.Lea-Neural" language="fr-FR">Un instant s\'il vous plaît, je vérifie pour vous.</Say>'
      : '<Say voice="Polly.Danielle-Neural" language="en-US">One moment please, checking that for you.</Say>';
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${holdSay}<Pause length="1"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
  }

  private isLikelyFrench(text: string): boolean {
    const frenchWords = [
      "bonjour", "oui", "non", "merci", "rendez-vous", "annuler", "confirmer",
      "reporter", "demain", "salut", "plaît", "plait", "docteur", "suis",
      "horaire", "heure", "matin", "soir"
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
      this.logger.log(
        `[processAgentAsync] 🤖 Running agent for callId=${callId}, userMessage="${userMessage}", language=${aiCall.language}`,
      );
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

      this.logger.log(`\n==================================================\n🤖 [AI ASSISTANT REPLIED]\n💬 Text: "${result.response}"\n🛠️ Tools: [${result.toolsUsed?.join(", ") || "none"}]\n🏁 Call Complete: ${result.isComplete}\n==================================================`);

      // Re-fetch fresh record to avoid stale overwrite
      const freshCall = await this.aiCallRepository.findOne({
        where: { id: callId },
      });
      if (!freshCall) {
        this.logger.error(
          `[processAgentAsync] ❌ Could not re-fetch AiCall for callId=${callId}`,
        );
        const errMsg = aiCall.language === "fr"
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
      freshCall.conversationHistory = this.serializeHistory(
        result.updatedHistory,
      );

      let twiml: string;
      if (result.isComplete) {
        freshCall.outcome = this.detectOutcome(result.response);
        freshCall.status = CallStatus.COMPLETED;
        freshCall.endedAt = new Date();
        this.logger.log(
          `[processAgentAsync] 📞 Call COMPLETE — outcome=${freshCall.outcome}`,
        );
        twiml = this.twilioService.generateTwiML(
          result.response,
          freshCall.language,
        );
      } else {
        const actionUrl = `${publicBaseUrl}/ai-call/twilio/voice?callId=${freshCall.id}`;
        this.logger.log(
          `[processAgentAsync] 🔄 Continuing — next webhook: ${actionUrl}`,
        );
        twiml = this.twilioService.generateGatherTwiML(
          result.response,
          actionUrl,
          freshCall.language,
        );
      }

      await this.aiCallRepository.save(freshCall);

      this.logger.log(
        `[processAgentAsync] 📤 TwiML stored for callId=${callId}. Poll will deliver it.`,
      );
      this.pendingResponses.set(callId, twiml);
    } catch (error: any) {
      this.logger.error(
        `[processAgentAsync] ❌ Error for callId=${callId}: ${error?.name} — ${error?.message}`,
      );
      this.logger.error(`[processAgentAsync] Stack:\n${error?.stack}`);
      const fallbackMsg = aiCall.language === "fr"
        ? "Nous éprouvons des difficultés techniques. Veuillez appeler la clinique directement. Au revoir."
        : "We are experiencing technical difficulties. Please call the clinic directly. Goodbye.";
      const fallback = this.twilioService.generateTwiML(
        fallbackMsg,
        aiCall.language,
      );
      this.pendingResponses.set(callId, fallback);
    }
  }

  async handlePollWebhook(callId: string): Promise<string> {
    this.logger.log(
      `[handlePollWebhook] 🔍 Checking response for callId=${callId}`,
    );
    const publicBaseUrl = this.configService.get<string>("PUBLIC_BASE_URL");

    if (!this.pendingResponses.has(callId)) {
      this.logger.warn(
        `[handlePollWebhook] ⚠️ No pending entry for callId=${callId} — may have already been delivered`,
      );
      return this.twilioService.generateTwiML(
        "An error occurred. Please call the clinic directly. Goodbye.",
        "en",
      );
    }

    const twiml = this.pendingResponses.get(callId);

    if (twiml === null) {
      // Still processing — tell Twilio to pause and poll again
      this.logger.log(
        `[handlePollWebhook] ⏳ Agent still processing for callId=${callId}. Sending another pause+redirect.`,
      );
      const pollUrl = `${publicBaseUrl}/ai-call/twilio/poll?callId=${callId}`;
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/><Redirect method="POST">${pollUrl}</Redirect></Response>`;
    }

    // Response is ready — deliver it and clean up
    this.logger.log(
      `[handlePollWebhook] ✅ Response ready for callId=${callId}. Delivering TwiML.`,
    );
    this.pendingResponses.delete(callId);
    return twiml;
  }

  async handleStatusCallback(body: any): Promise<void> {
    if (!body.CallSid) return;
    const aiCall = await this.aiCallRepository.findOne({
      where: { twilioCallSid: body.CallSid },
    });
    if (!aiCall) {
      this.logger.warn(
        `Received status callback for unknown CallSid: ${body.CallSid}`,
      );
      return;
    }

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
