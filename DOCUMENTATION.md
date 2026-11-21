# MediSchedule AI Call Agent POC — Complete Architecture & Module Guide

---

## 1. System Overview & Architecture

The **MediSchedule AI Call Agent POC** is an enterprise-structured NestJS and TypeScript backend application designed for automated patient medical appointment verification and scheduling over telephone calls.

### 1.1 High-Level Architecture Diagram

```
                              +---------------------------+
                              |   Telephone Network (PSTN)|
                              +-------------+-------------+
                                            |
                                            v (Voice Audio)
                              +-------------+-------------+
                              | Twilio Programmable Voice |
                              +-------------+-------------+
                                            |
                        HTTP Webhook        | Voice Recognition (<Gather>)
                     (POST /ai-call/start)  | SpeechResult (text)
                                            v
+-----------------------------------------------------------------------------------+
| NestJS Application Backend                                                        |
|                                                                                   |
|  +------------------------+        +-------------------------------------------+  |
|  |    AiCallController    |<------>|               AiCallService               |  |
|  +------------------------+        +---------------------+---------------------+  |
|                                                          |                        |
|                     +------------------------------------+                        |
|                     |                                    |                        |
|                     v                                    v                        |
|       +---------------------------+        +---------------------------+          |
|       |       TwilioService       |        |       AgentService        |          |
|       | (TwiML / REST Call API)   |        |  (@langchain/langgraph)   |          |
|       +---------------------------+        +-------------+-------------+          |
|                                                          |                        |
|                                  +-----------------------+-------+                |
|                                  |                               |                |
|                                  v                               v                |
|                    +---------------------------+   +---------------------------+  |
|                    |     7 LangChain Tools     |   |   Google Gemini Model     |  |
|                    |   (Verify, Reschedule...) |   |     (gemini-3.6-flash)    |  |
|                    +-------------+-------------+   +---------------------------+  |
|                                  |                                                |
|                      +-----------+-----------+                                    |
|                      v                       v                                    |
|            +-------------------+   +--------------------+                         |
|            |  PatientsService  |   |AppointmentsService |                         |
|            +---------+---------+   +---------+----------+                         |
|                      |                       |                                    |
+----------------------|-----------------------|------------------------------------+
                       v                       v
         +-------------------------------------------------+
         |            PostgreSQL Database (TypeORM)        |
         |  - patients                                     |
         |  - appointments                                 |
         |  - ai_calls (JSONB transcripts & agent history) |
         +-------------------------------------------------+
                                |
                                v (Observability & Tracing)
         +-------------------------------------------------+
         |                 LangSmith Platform              |
         |   - Prompt traces, latency, token usage, tools  |
         +-------------------------------------------------+
```

---

## 2. Comprehensive Module Breakdown

The project follows NestJS modular architecture principles where each domain is encapsulated inside its own module.

### 2.1 Summary of All Modules

| Module Name | Directory | Primary Role | Key Dependencies |
| :--- | :--- | :--- | :--- |
| **`AppModule`** | `src/app.module.ts` | Root module; wires all submodules, configuration, and global throttler guard. | All application modules |
| **`DatabaseModule`** | `src/database/` | Configures PostgreSQL connection via TypeORM, handles entity registration & schema sync. | `@nestjs/typeorm`, `pg` |
| **`AiCallModule`** | `src/ai-call/` | Orchestrates end-to-end call lifecycle, Twilio webhooks, and conversational state persistence. | `TwilioModule`, `LangchainModule`, TypeORM |
| **`LangchainModule`** | `src/langchain/` | Hosts the LangGraph ReAct agent, tool definitions, Gemini LLM instance, and system prompt. | `PatientsModule`, `AppointmentsModule`, `LangsmithModule` |
| **`LangsmithModule`** | `src/langsmith/` | Initializes LangSmith distributed tracing, metadata extraction, and tagging. | `@nestjs/config`, `langsmith` |
| **`TwilioModule`** | `src/twilio/` | Wraps Twilio Voice REST API, TwiML generation (`<Gather>`, `<Say>`, `<Hangup>`), and webhook security. | `twilio` SDK |
| **`PatientsModule`** | `src/patients/` | Patient identity verification, phone normalization, and patient record retrieval. | TypeORM (`Patient` entity) |
| **`AppointmentsModule`**| `src/appointments/` | Appointment scheduling, status updating, available slots calculation, and rescheduling. | TypeORM (`Appointment` entity) |
| **`CommonModule`** | `src/common/` | Shared enums, constants, global exception filters, and request logging interceptors. | NestJS core |

---

## 3. Deep Dive: `LangchainModule` (The AI Engine)

The `LangchainModule` (`src/langchain/`) is the central intelligence of the system. It handles LLM prompt engineering, multi-turn reasoning, tool execution, and state persistence.

### 3.1 Architecture of the Agent

The agent is implemented using **LangGraph's prebuilt ReAct agent** (`createReactAgent`) from `@langchain/langgraph/prebuilt`.

```
                        Patient Utterance (SpeechResult)
                                      |
                                      v
                        +---------------------------+
                        |  Build Full Message Array |
                        |  - SystemMessage (Prompt) |
                        |  - Previous History       |
                        |  - HumanMessage (Input)   |
                        +-------------+-------------+
                                      |
                                      v
                        +---------------------------+
                        |     agent.invoke()        |
                        | (LangGraph ReAct Loop)    |
                        +-------------+-------------+
                                      |
                 +--------------------+--------------------+
                 |                                         |
                 v (Decision: Tool Call)                   v (Decision: Final Answer)
    +---------------------------+             +---------------------------+
    | Execute Structured Tool   |             | Generate Natural Response |
    | (e.g., verifyPatient)     |             +-------------+-------------+
    +-------------+-------------+                           |
                  |                                         v
                  v                                 Check for Marker:
    +---------------------------+                   `[CALL_COMPLETE]`
    | Return Tool Output to LLM |                           |
    +-------------+-------------+                           v
                  |                                 Return `AgentRunResult`
                  +------> (Re-evaluate)            to `AiCallService`
```

### 3.2 The Underlying Model
The agent utilizes **Google Gemini** (`gemini-3.6-flash`) via `@langchain/google-genai`:
- **Model Choice**: `gemini-3.6-flash` is chosen for its ultra-low latency (<500ms time-to-first-token), native function/tool-calling capabilities, and multi-turn instruction adherence.
- **Configuration** (`src/langchain/agent/agent.service.ts`):
  ```typescript
  private createModel() {
    return new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: this.configService.get<string>('GEMINI_MODEL', 'gemini-3.6-flash'),
      temperature: 0.3,       // Low temperature for deterministic, clinical conversations
      maxOutputTokens: 512,   // Phone responses must remain concise and speakable
    });
  }
  ```

### 3.3 Prompt Engineering (`system.prompt.ts`)

The system prompt enforces strict clinical and telephonic conversational behavior:
1. **Persona**: Professional, warm, and concise medical clinic assistant.
2. **Phone Optimization**: Responses are limited to 1–2 short sentences because long paragraphs sound unnatural when read by Text-to-Speech (TTS).
3. **Safety & HIPAA**:
   - The agent **never confirms or reveals appointment details** until patient identity is verified using `verify_patient`.
4. **Completion Signaling**:
   - When the conversation reaches its natural conclusion (appointment confirmed, rescheduled, or cancelled), the model appends the hidden marker `[CALL_COMPLETE]` to its response text.
   - The backend detects this token, strips it before sending audio to the patient, and instructs Twilio to hang up the call.

### 3.4 The 7 Dynamic Structured Tools

Each tool is constructed using LangChain's `DynamicStructuredTool` with a strongly typed **Zod** schema.

#### 1. `verify_patient` (`verify-patient.tool.ts`)
- **Purpose**: Verifies that the caller's stated identity matches the clinic records before discussing medical data.
- **Input Schema**:
  ```typescript
  z.object({
    phoneNumber: z.string().describe('The phone number of the patient in E.164 or digits'),
    patientId: z.string().describe('The alphanumeric patient ID, e.g. PAT-001'),
  })
  ```
- **Execution**: Normalizes both phone numbers to clean digit strings, compares them, and returns `{ verified: boolean, patientName?: string, reason?: string }`.

#### 2. `get_appointment` (`get-appointment.tool.ts`)
- **Purpose**: Retrieves appointment details (date, time, physician, clinic, appointment type, status).
- **Input Schema**: `appointmentId: z.string()`
- **Output**: JSON representation of the appointment entity.

#### 3. `confirm_appointment` (`confirm-appointment.tool.ts`)
- **Purpose**: Confirms a pending appointment in the clinic database.
- **Input Schema**: `appointmentId: z.string()`
- **Output**: `{ success: true, appointmentId, status: "CONFIRMED", message: "..." }`

#### 4. `cancel_appointment` (`cancel-appointment.tool.ts`)
- **Purpose**: Cancels an appointment and records the patient's reason.
- **Input Schema**:
  ```typescript
  z.object({
    appointmentId: z.string(),
    reason: z.string().optional().describe('Patient reason for cancellation'),
  })
  ```
- **Output**: `{ success: true, appointmentId, status: "CANCELLED", message: "..." }`

#### 5. `get_available_slots` (`get-available-slots.tool.ts`)
- **Purpose**: Queries available time slots for a given physician on a selected date.
- **Input Schema**:
  ```typescript
  z.object({
    physicianId: z.string(),
    date: z.string().describe('YYYY-MM-DD format'),
  })
  ```
- **Output**: List of available slots (e.g. `["09:00", "11:30", "14:00"]`).

#### 6. `reschedule_appointment` (`reschedule-appointment.tool.ts`)
- **Purpose**: Updates an appointment to a new date and time.
- **Input Schema**:
  ```typescript
  z.object({
    appointmentId: z.string(),
    newDate: z.string().describe('Target date in YYYY-MM-DD'),
    newTime: z.string().describe('Target time in HH:mm'),
  })
  ```
- **Output**: `{ success: true, appointmentId, newDate, newTime, status: "RESCHEDULED" }`

#### 7. `mark_call_later` (`mark-call-later.tool.ts`)
- **Purpose**: Sets a requested callback time if the patient is currently driving, busy, or unable to speak.
- **Input Schema**:
  ```typescript
  z.object({
    appointmentId: z.string(),
    callbackTime: z.string().describe('Requested callback time/day'),
  })
  ```

### 3.5 Conversation Continuity & State Serialization

Because Twilio webhooks are stateless HTTP requests triggered on every spoken turn, LangChain conversation history cannot remain solely in memory.

1. **Storage in PostgreSQL**:
   The `ai_calls` table maintains two separate JSONB columns:
   - `transcript`: Human-readable conversation timeline (role, content, timestamp, tool inputs/outputs).
   - `conversation_history`: Serialized representation of LangChain `BaseMessage` objects.

2. **Serialization & Deserialization Flow** (`src/ai-call/ai-call.service.ts`):
   ```typescript
   // Serialization before DB save:
   private serializeHistory(history: BaseMessage[]): any[] {
     return history.map((msg) => ({
       _getType: msg._getType(), // 'human' | 'ai' | 'tool'
       content: msg.content,
     }));
   }

   // Deserialization on incoming webhook:
   private deserializeHistory(storedHistory: any[]): BaseMessage[] {
     return storedHistory.map((item) => {
       if (item._getType === 'human') return new HumanMessage(item.content);
       if (item._getType === 'ai') return new AIMessage(item.content);
       return new HumanMessage(item.content);
     });
   }
   ```

---

## 4. Deep Dive: `LangsmithModule` (Observability & Tracing)

The `LangsmithModule` (`src/langsmith/`) provides production-grade observability into every reasoning step taken by the AI agent.

```
+-------------------------------------------------------------------------------+
| LangSmith Tracing Dashboard                                                   |
|                                                                               |
| Project: medi-schedule-ai-call-agent                                          |
|                                                                               |
| Run Name: ai-call-590226b5-turn                                               |
| Tags: ["ai-call", "appointment-confirmation", "clinic-CLINIC-001", "lang-en"] |
| Metadata: { patientId: "PAT-001", twilioCallSid: "CA...", ... }               |
|                                                                               |
|  [Root Trace: ReAct Agent Run] (Duration: 840ms, Tokens: 412)                 |
|   |                                                                           |
|   +---> [LLM: gemini-3.6-flash] Input: "Hello, this is John Smith..."        |
|   |     Output: ToolCall(verify_patient, { patientId: "PAT-001", ... })       |
|   |                                                                           |
|   +---> [Tool: verify_patient] Output: { "verified": true }                   |
|   |                                                                           |
|   +---> [LLM: gemini-3.6-flash] Input: ToolResult                            |
|         Output: "Hello John! Your appointment is confirmed for Oct 15..."    |
+-------------------------------------------------------------------------------+
```

### 4.1 Global Activation
The module is decorated with `@Global()`. When the application bootstraps, `LangsmithService` automatically configures the environment variables required by LangChain's native tracing hooks:
```typescript
@Injectable()
export class LangsmithService {
  constructor(private readonly configService: ConfigService) {
    if (this.configService.get<string>('LANGSMITH_TRACING') === 'true') {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = this.configService.get<string>('LANGSMITH_API_KEY');
      process.env.LANGCHAIN_PROJECT = this.configService.get<string>('LANGSMITH_PROJECT', 'medi-schedule-ai-call-agent');
      process.env.LANGCHAIN_ENDPOINT = this.configService.get<string>('LANGSMITH_ENDPOINT', 'https://api.smith.langchain.com');
    }
  }
}
```

### 4.2 Metadata & Tag Injection
Every call turn dispatched to `agent.invoke()` is enriched with domain context:
- **Run Name**: `ai-call-${params.callId}-turn`
- **Thread ID**: Configured as `params.callId` for conversation grouping.
- **Custom Metadata**:
  ```typescript
  {
    callId: params.callId,
    patientId: params.patientId,
    appointmentId: params.appointmentId,
    clinicId: params.clinicId,
    twilioCallSid: params.twilioCallSid,
    language: params.language,
    callType: params.callType,
  }
  ```
- **Custom Tags**:
  ```typescript
  ['ai-call', params.callType, `clinic-${params.clinicId}`, `lang-${params.language}`]
  ```

This allows clinic administrators to filter traces in LangSmith by clinic, by patient, or by call outcome to analyze AI latency, token costs, and tool accuracy.

---

## 5. Other Core Modules

### 5.1 `AiCallModule` (`src/ai-call/`)
- **Endpoints**:
  - `POST /ai-call/start`: Validates `StartCallDto`, records `AiCall` entity, and creates outbound phone call via `TwilioService`. Supports optional `testMode: true`.
  - `POST /ai-call/twilio/voice?callId=<id>`: Receives user speech from Twilio `<Gather>`, invokes `AgentService.runAgentTurn()`, and responds with fresh TwiML.
  - `POST /ai-call/twilio/status`: Webhook for call events (`initiated`, `ringing`, `answered`, `completed`). Updates call duration and status in PostgreSQL.
  - `GET /ai-call/:id`: Retrieves call details and outcome.
  - `GET /ai-call/:id/transcript`: Returns clean transcript of the conversation.

### 5.2 `TwilioModule` (`src/twilio/`)
- Encapsulates all Twilio operations:
  - `createOutboundCall(to, webhookUrl, callId)`: Initiates PSTN phone call.
  - `generateGatherTwiML(speechText, actionUrl)`: Emits XML with `<Gather input="speech">` and `<Say voice="alice">`.
  - `generateHangupTwiML(speechText)`: Speaks final response and issues `<Hangup/>`.
  - `validateWebhookSignature()`: Cryptographically validates that incoming webhooks originated from Twilio.

### 5.3 `PatientsModule` & `AppointmentsModule`
- Provide clean domain services and REST endpoints for Patient and Appointment entities.
- Used both directly via HTTP and internally as the business logic behind the AI's LangChain tools.

### 5.4 `CommonModule` & Filters
- **`AllExceptionsFilter`**: Global exception filter ensuring no sensitive stack traces or credentials leak in API responses.
- **`LoggingInterceptor`**: Intercepts requests, logs HTTP method, status code, and latency in milliseconds.
- **`constants.ts`**: Central canonical source for all system enums (`CallStatus`, `CallOutcome`, `CallType`, `AppointmentStatus`).

---

## 6. End-to-End Call Execution Lifecycle

```
[API Consumer]                [AiCallService]            [Twilio]             [Patient Phone]
      |                              |                       |                       |
      | 1. POST /ai-call/start       |                       |                       |
      +----------------------------->|                       |                       |
      |                              | 2. Create DB record   |                       |
      |                              | 3. calls.create()     |                       |
      |                              +---------------------->|                       |
      |<-----------------------------+                       | 4. Ring Phone         |
      | 201 { callId, status }       |                       +---------------------->|
      |                              |                       |                       |
      |                              |                       | 5. Patient Answers    |
      |                              |                       |<----------------------+
      |                              | 6. Webhook Trigger    |                       |
      |                              |    (callId)           |                       |
      |                              |<----------------------+                       |
      |                              |                       |                       |
      |                              | 7. Invoke LangChain   |                       |
      |                              |    (Gemini + Tools)   |                       |
      |                              | 8. Return TwiML       |                       |
      |                              |    <Gather><Say>      |                       |
      |                              +---------------------->| 9. Speaks AI greeting |
      |                              |                       +---------------------->|
      |                              |                       | 10. Patient replies   |
      |                              | 11. Webhook with      |<----------------------+
      |                              |     SpeechResult      |                       |
      |                              |<----------------------+                       |
      |                              | 12. Agent Turn Loop   |                       |
      |                              |     (Tools + Memory)  |                       |
      |                              | 13. [CALL_COMPLETE]   |                       |
      |                              |     detected          |                       |
      |                              | 14. Return TwiML      |                       |
      |                              |     <Say><Hangup/>    | 15. Speaks goodbye    |
      |                              +---------------------->+     and terminates    |
      |                              |                       |---------------------->|
```

---

## 7. How to Test the Complete Flow

### 7.1 Automated Testing
```bash
# Run all unit tests (services and tools)
npm test

# Run code style and lint verification
npm run lint

# Verify build with SWC compiler
npm run build
```

### 7.2 Interactive API Testing (Swagger)
1. Open `http://localhost:3000/api` in your browser.
2. Trigger `POST /ai-call/start` with:
   ```json
   {
     "phoneNumber": "+919727366177",
     "patientId": "PAT-001",
     "clinicId": "CLINIC-001",
     "appointmentId": "APT-001",
     "language": "en",
     "callType": "appointment_confirmation",
     "testMode": true
   }
   ```
3. Use the returned `callId` to test turns against `POST /ai-call/twilio/voice?callId=<callId>`:
   ```json
   {
     "SpeechResult": "Hello, my patient ID is PAT-001 and my phone number is +919727366177"
   }
   ```
4. Check the AI response and view live traces inside your **LangSmith Dashboard**.
