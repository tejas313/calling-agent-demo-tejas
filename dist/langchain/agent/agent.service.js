"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AgentService", {
    enumerable: true,
    get: function() {
        return AgentService;
    }
});
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _googlegenai = require("@langchain/google-genai");
const _messages = require("@langchain/core/messages");
const _patientsservice = require("../../patients/patients.service");
const _appointmentsservice = require("../../appointments/appointments.service");
const _langsmithservice = require("../../langsmith/langsmith.service");
const _systemprompt = require("../prompts/system.prompt");
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    } else {
        for(var i = decorators.length - 1; i >= 0; i--){
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(metadataKey, metadataValue);
    }
}
let AgentService = class AgentService {
    createModel() {
        const configuredModel = this.configService.get('GEMINI_MODEL');
        // Force the working model: override broken/overloaded models (gemini-3.8-flash, gemini-2.0-flash, etc.)
        const activeModel = configuredModel && !configuredModel.includes('3.8') && !configuredModel.includes('2.0') && !configuredModel.includes('3.0') && !configuredModel.includes('1.5') ? configuredModel : 'gemini-3.5-flash-lite';
        return new _googlegenai.ChatGoogleGenerativeAI({
            apiKey: this.configService.get('GOOGLE_API_KEY'),
            model: activeModel,
            temperature: 0.3,
            maxOutputTokens: 512,
            maxRetries: 0
        });
    }
    createTools() {
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
    */ return [];
    }
    async runAgentTurn(params) {
        try {
            const tools = this.createTools();
            const model = this.createModel();
            const modelName = model?.model || 'gemini-3.5-flash-lite';
            this.logger.log(`[runAgentTurn] ▶ callId=${params.callId}, turn userMessage="${params.userMessage}", model=${modelName}`);
            this.logger.log(`[runAgentTurn] patientId=${params.patientId}, appointmentId=${params.appointmentId}, language=${params.language}, callType=${params.callType}`);
            // DATABASE LOOKUP (Active: retrieves patient & appointment context from DB in ~1ms)
            let patientName = '';
            let appointmentDate = '';
            try {
                if (params.patientId) {
                    const patient = await this.patientsService.findById(params.patientId);
                    patientName = patient?.name || '';
                }
                if (params.appointmentId) {
                    const appt = await this.appointmentsService.findById(params.appointmentId);
                    const dateStr = appt?.date ? `${appt.date}` : '';
                    const timeStr = appt?.time ? ` at ${appt.time}` : '';
                    appointmentDate = `${dateStr}${timeStr}`.trim();
                }
            } catch (err) {
                this.logger.warn(`[runAgentTurn] Context lookup notice: ${err?.message}`);
            }
            this.logger.log(`[runAgentTurn] 💾 DB Context retrieved: Patient="${patientName || 'John'}", Appointment="${appointmentDate || 'upcoming slot'}"`);
            const systemPrompt = (0, _systemprompt.buildSystemPrompt)({
                language: params.language,
                patientName,
                patientId: params.patientId,
                appointmentId: params.appointmentId,
                appointmentDate
            });
            // Turn 1: Deliver immediate greeting without delay
            if (params.userMessage === 'START_CONVERSATION') {
                const apptMention = appointmentDate ? ` on ${appointmentDate}` : '';
                const greeting = patientName ? `Hello ${patientName}, I'm Alice from our medical clinic calling regarding your appointment${apptMention}. How can I help you today?` : `Hello, I'm Alice from our medical clinic calling regarding your appointment${apptMention}. How can I help you today?`;
                this.logger.log(`[runAgentTurn] ⚡ Turn 1 immediate greeting: "${greeting}"`);
                return {
                    response: greeting,
                    isComplete: false,
                    updatedHistory: [
                        ...params.conversationHistory,
                        new _messages.AIMessage(greeting)
                    ],
                    toolsUsed: []
                };
            }
            const messages = [
                new _messages.SystemMessage(systemPrompt),
                ...params.conversationHistory,
                new _messages.HumanMessage(params.userMessage)
            ];
            this.logger.log(`[runAgentTurn] Total messages sent to LLM: ${messages.length} (history=${params.conversationHistory.length})`);
            // DIRECT CONVERSATIONAL INVOCATION (DB tools & React Agent commented out below)
            this.logger.log(`[runAgentTurn] 🤖 Invoking LLM directly for conversation...`);
            let responseText = '';
            try {
                const responseMessage = await Promise.race([
                    model.invoke(messages),
                    new Promise((_, reject)=>setTimeout(()=>reject(new Error('LLM_TIMEOUT: Model took longer than 10 seconds')), 10000))
                ]);
                if (typeof responseMessage.content === 'string') {
                    responseText = responseMessage.content;
                } else if (Array.isArray(responseMessage.content)) {
                    responseText = responseMessage.content.map((c)=>typeof c === 'string' ? c : c?.text || '').join(' ');
                } else {
                    responseText = String(responseMessage.content || '');
                }
            } catch (err) {
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
      */ responseText = typeof responseText === 'string' ? responseText : String(responseText || '');
            this.logger.log(`[runAgentTurn] Raw response: "${responseText.substring(0, 200)}"`);
            const toolsUsed = []; // DB tools commented out for conversational mode
            this.logger.log(`[runAgentTurn] Tools used: [${toolsUsed.join(', ') || 'none'}]`);
            const isComplete = responseText.includes(_systemprompt.CALL_COMPLETE_MARKER);
            this.logger.log(`[runAgentTurn] isComplete=${isComplete} (marker found: ${isComplete})`);
            if (isComplete) {
                responseText = responseText.replace(_systemprompt.CALL_COMPLETE_MARKER, '').trim();
            }
            const updatedHistory = [
                ...params.conversationHistory,
                new _messages.HumanMessage(params.userMessage),
                new _messages.AIMessage(responseText)
            ];
            return {
                response: responseText,
                isComplete,
                updatedHistory,
                toolsUsed
            };
        } catch (error) {
            this.logger.error(`[runAgentTurn] ❌ FATAL ERROR for callId=${params.callId}`);
            this.logger.error(`[runAgentTurn] Error name: ${error?.name}`);
            this.logger.error(`[runAgentTurn] Error message: ${error?.message}`);
            this.logger.error(`[runAgentTurn] Stack:\n${error?.stack}`);
            throw error;
        }
    }
    constructor(configService, patientsService, appointmentsService, langsmithService){
        this.configService = configService;
        this.patientsService = patientsService;
        this.appointmentsService = appointmentsService;
        this.langsmithService = langsmithService;
        this.logger = new _common.Logger(AgentService.name);
    }
};
AgentService = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService,
        typeof _patientsservice.PatientsService === "undefined" ? Object : _patientsservice.PatientsService,
        typeof _appointmentsservice.AppointmentsService === "undefined" ? Object : _appointmentsservice.AppointmentsService,
        typeof _langsmithservice.LangsmithService === "undefined" ? Object : _langsmithservice.LangsmithService
    ])
], AgentService);

//# sourceMappingURL=agent.service.js.map