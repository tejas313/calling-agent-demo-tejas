# MediSchedule AI Call Agent POC — Implementation Plan

## Overview

A production-structured NestJS/TypeScript proof-of-concept for an AI-powered outbound phone calling agent for medical appointment scheduling. The system connects Twilio Programmable Voice → NestJS webhooks → LangChain.js agent → Google Gemini LLM → appointment tools → PostgreSQL (mock data), all traced through LangSmith.

---

## Architecture Diagram

```
POST /ai-call/start
      │
      ▼
AiCallService.startCall()
      │
      ├──► PostgreSQL: create AiCall record
      │
      └──► TwilioService.createOutboundCall()
                │
                ▼
           Twilio Cloud ─────────────────────────────────────┐
                │                                            │
                ▼                                            │
     POST /ai-call/twilio/voice  ◄───── Twilio requests TwiML │
                │                                            │
                ▼                                            │
     LangChainService.runAgent()                             │
                │                                            │
                ├──► Google Gemini (via ChatGoogleGenerativeAI)│
                │                                            │
                ├──► Tools:                                  │
                │    ├── verifyPatient                       │
                │    ├── getAppointment                      │
                │    ├── confirmAppointment                  │
                │    ├── cancelAppointment                   │
                │    ├── getAvailableSlots                   │
                │    ├── rescheduleAppointment               │
                │    └── markCallLater                       │
                │                                            │
                └──► LangSmith (tracing)                     │
                                                             │
     POST /ai-call/twilio/status  ◄──── Twilio status callback│
                │                                            │
                ▼                                            │
     AiCallService.handleStatusUpdate()                      │
```

---

## Proposed Changes

### Project Root

#### [NEW] `package.json`
NestJS app with all required dependencies: `@nestjs/*`, `langchain`, `@langchain/google-genai`, `@langchain/langgraph`, `langsmith`, `twilio`, `typeorm`, `pg`, `class-validator`, `@nestjs/swagger`, `dotenv`, etc.

#### [NEW] `tsconfig.json`, `.eslintrc.js`, `.prettierrc`
TypeScript strict config, ESLint with NestJS rules, Prettier formatting.

#### [NEW] `docker-compose.yml`
PostgreSQL service for local development.

#### [NEW] `.env.example`
All required environment variables (no values).

#### [NEW] `Makefile`
Convenience commands for dev, build, test, seed, migrate.

---

### Database Layer

#### [NEW] `src/database/database.module.ts`
TypeORM connection via `DATABASE_URL`.

#### [NEW] `src/database/migrations/`
SQL schema migration files for: `patients`, `appointments`, `ai_calls`, `physicians`, `clinics`.

#### [NEW] `src/database/seeds/seed.ts`
Fake seed data: 2 clinics, 3 physicians, 5 patients, 10 appointments.

---

### Entities

#### [NEW] `src/patients/entities/patient.entity.ts`
TypeORM entity with: id, name, phone, dateOfBirth, language.

#### [NEW] `src/appointments/entities/appointment.entity.ts`
TypeORM entity with: id, patientId, clinicId, physicianId, date, time, appointmentType, status (enum: PENDING/CONFIRMED/CANCELLED/RESCHEDULED).

#### [NEW] `src/ai-call/entities/ai-call.entity.ts`
TypeORM entity with full call record including transcript, outcome, timing.

---

### Patients Module

#### [NEW] `src/patients/patients.module.ts`
#### [NEW] `src/patients/patients.service.ts`
Methods: `findById()`, `findByPhone()`, `verifyPatient()`.
#### [NEW] `src/patients/patients.controller.ts`
GET /patients, GET /patients/:id (demo/admin only).

---

### Appointments Module

#### [NEW] `src/appointments/appointments.module.ts`
#### [NEW] `src/appointments/appointments.service.ts`
Methods: `findById()`, `getByPatient()`, `confirm()`, `cancel()`, `reschedule()`, `getAvailableSlots()`.
#### [NEW] `src/appointments/appointments.controller.ts`
CRUD + action endpoints.

---

### LangChain Tools

#### [NEW] `src/langchain/tools/verify-patient.tool.ts`
DynamicStructuredTool wrapping `PatientsService.verifyPatient()`.

#### [NEW] `src/langchain/tools/get-appointment.tool.ts`
DynamicStructuredTool wrapping `AppointmentsService.findById()`.

#### [NEW] `src/langchain/tools/confirm-appointment.tool.ts`
DynamicStructuredTool wrapping `AppointmentsService.confirm()`.

#### [NEW] `src/langchain/tools/cancel-appointment.tool.ts`
DynamicStructuredTool wrapping `AppointmentsService.cancel()`.

#### [NEW] `src/langchain/tools/get-available-slots.tool.ts`
DynamicStructuredTool wrapping `AppointmentsService.getAvailableSlots()`.

#### [NEW] `src/langchain/tools/reschedule-appointment.tool.ts`
DynamicStructuredTool wrapping `AppointmentsService.reschedule()`.

#### [NEW] `src/langchain/tools/mark-call-later.tool.ts`
DynamicStructuredTool storing callback request.

---

### LangChain Agent

#### [NEW] `src/langchain/agent/agent.service.ts`
- Creates `ChatGoogleGenerativeAI` (gemini-1.5-flash or gemini-pro).
- Builds `createReactAgent` from `@langchain/langgraph/prebuilt`.
- Injects all 7 tools.
- Wraps execution with LangSmith `traceable` + metadata tags.

#### [NEW] `src/langchain/prompts/system.prompt.ts`
Full system prompt as described in the spec.

#### [NEW] `src/langchain/langchain.module.ts`
Exports `AgentService`, imports `PatientsModule`, `AppointmentsModule`.

---

### LangSmith Module

#### [NEW] `src/langsmith/langsmith.module.ts`
#### [NEW] `src/langsmith/langsmith.service.ts`
Initializes LangSmith client. Provides `createRun()`, `addTags()`, and `getTraceUrl()` helpers.

---

### Twilio Module

#### [NEW] `src/twilio/twilio.module.ts`
#### [NEW] `src/twilio/twilio.service.ts`
- `createOutboundCall(to, from, webhookUrl)` — Twilio REST API.
- `validateWebhookSignature(req)` — Twilio signature validation.
- `generateTwiML(text)` — returns `<Response><Say>` TwiML.
- `generateGatherTwiML(text, actionUrl)` — returns `<Gather>` TwiML for speech input.

#### [NEW] `src/twilio/twilio.controller.ts`
`POST /twilio/voice`, `POST /twilio/status`, `POST /twilio/recording` (these are proxied from ai-call controller).

---

### AI Call Module (Core Orchestrator)

#### [NEW] `src/ai-call/ai-call.module.ts`
#### [NEW] `src/ai-call/ai-call.controller.ts`
All public API endpoints:
- `POST /ai-call/start`
- `GET /ai-call/:id`
- `GET /ai-call/:id/transcript`
- `POST /ai-call/twilio/voice`
- `POST /ai-call/twilio/status`
- `POST /ai-call/twilio/recording`

#### [NEW] `src/ai-call/ai-call.service.ts`
Core orchestration:
- `startCall()` — creates DB record + initiates Twilio call.
- `handleVoiceWebhook()` — receives speech, runs LangChain agent, returns TwiML.
- `handleStatusCallback()` — updates call status/duration/outcome.
- `getCall()` / `getTranscript()` — read DB.

#### [NEW] `src/ai-call/dto/start-call.dto.ts`
Validated DTO with: phoneNumber, patientId, clinicId, appointmentId, language, callType.

#### [NEW] `src/ai-call/dto/twilio-voice.dto.ts`
Twilio webhook body DTO.

---

### Common

#### [NEW] `src/common/guards/twilio-webhook.guard.ts`
Validates Twilio request signatures before processing webhooks.

#### [NEW] `src/common/interceptors/logging.interceptor.ts`
Structured logging (no sensitive data).

#### [NEW] `src/common/filters/all-exceptions.filter.ts`
Global error filter — never exposes secrets.

#### [NEW] `src/common/constants/index.ts`
Intent enum, call status enum, appointment status enum.

---

### App Root

#### [NEW] `src/app.module.ts`
Root module: imports all feature modules + ThrottlerModule (rate limiting).

#### [NEW] `src/main.ts`
Bootstrap: Swagger setup, global pipes, global guards, global interceptors, CORS.

---

### Tests

#### [NEW] `test/unit/tools/verify-patient.tool.spec.ts`
#### [NEW] `test/unit/tools/get-appointment.tool.spec.ts`
#### [NEW] `test/unit/tools/confirm-appointment.tool.spec.ts`
#### [NEW] `test/unit/tools/cancel-appointment.tool.spec.ts`
#### [NEW] `test/unit/tools/get-available-slots.tool.spec.ts`
#### [NEW] `test/unit/tools/reschedule-appointment.tool.spec.ts`
#### [NEW] `test/unit/appointments/appointments.service.spec.ts`
#### [NEW] `test/unit/patients/patients.service.spec.ts`
#### [NEW] `test/e2e/ai-call.e2e.spec.ts`
Integration test for `POST /ai-call/start` with Twilio mocked.

---

### Documentation

#### [NEW] `README.md`
Full documentation per spec (19 sections).

---

## Key Technical Decisions

### LangChain Agent Pattern
- Uses `createReactAgent` from `@langchain/langgraph/prebuilt` (ReAct pattern).
- For conversation turns: each Twilio `<Gather>` speech input is fed back into the agent as a user message in the same conversation thread.
- Call state (conversation history, intent progress) is stored in the `AiCall` entity between Twilio webhook calls.

### Twilio Conversation Flow
- First webhook call: agent introduces itself and gathers patient response via `<Gather action="/ai-call/twilio/voice" input="speech">`.
- Subsequent webhook calls: `SpeechResult` from Twilio is fed into the agent along with conversation history.
- Agent returns text → TwiML `<Say>` + `<Gather>` for next turn, or `<Hangup>` when done.

### Modularity
- `TwilioService` is behind an interface `IVoiceProvider` — swappable.
- `AgentService` uses `BaseChatModel` — Gemini is injected via config, swappable.

### Security
- Twilio webhook signature validation on all `/twilio/*` routes.
- Rate limiting on `POST /ai-call/start` (10 req/min default).
- No secrets in logs or error responses.
- All DTOs validated with `class-validator`.

---

## Verification Plan

### Automated Tests
```bash
npm run test          # Unit tests (all tool specs)
npm run test:e2e      # Integration tests
npm run build         # TypeScript compilation
npm run lint          # ESLint
```

### Manual Verification
1. Run `docker-compose up -d` to start PostgreSQL.
2. Run `npm run migration:run` + `npm run seed`.
3. Start `ngrok http 3000`, set `PUBLIC_BASE_URL`.
4. `npm run start:dev`.
5. Use Swagger UI at `http://localhost:3000/api` to trigger `POST /ai-call/start`.
6. Verify call arrives on test phone.
7. View trace in LangSmith dashboard.

---

## Open Questions

> [!NOTE]
> These are design decisions I'll make sensibly for the POC and can be adjusted later:
> 1. **Conversation continuity**: Twilio webhooks are stateless HTTP calls. I will store conversation history JSON in the `AiCall.transcript` column and reload it on each webhook turn.
> 2. **Speech language**: Twilio `<Gather language="en-US">` for English; parameterized for French later.
> 3. **LangGraph vs simple agent**: Using `createReactAgent` for simplicity in POC; LangGraph stateful graph can replace it for production.
> 4. **Test DB**: Unit tests use in-memory mocks (TypeORM `Repository` mock); e2e tests use SQLite in-memory or a test PostgreSQL.
