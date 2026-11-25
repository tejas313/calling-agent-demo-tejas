# MediSchedule AI Call Agent & Clinical Triage System — Architecture & Operations Guide

---

## 1. System Overview & Architecture

The **MediSchedule AI Medical Assistant Platform** is a NestJS and TypeScript backend application designed for automated patient scheduling, bilingual telephonic calling (Twilio), AI-powered referral intake and triage (OpenAI & LangChain/LangGraph), and priority-based appointment automation.

```
                               +---------------------------+
                               |   Telephone Network (PSTN)|
                               +-------------+-------------+
                                             |
                         Inbound / Outbound  | Voice Audio & SMS
                                             v
                               +-------------+-------------+
                               | Twilio Programmable Voice |
                               |      & Messaging API      |
                               +-------------+-------------+
                                             |
                         HTTP Webhooks       | SpeechResult / DTMF / SMS
                      (/ai-call/twilio/*)    v
+---------------------------------------------------------------------------------------------------+
| NestJS Application Backend                                                                        |
|                                                                                                   |
|  +------------------------+        +-------------------------------------------+                  |
|  |    AiCallController    |<------>|               AiCallService               |                  |
|  +------------------------+        +---------------------+---------------------+                  |
|                                                          |                                        |
|                     +------------------------------------+--------------------+                   |
|                     |                                    |                    |                   |
|                     v                                    v                    v                   |
|       +---------------------------+        +---------------------------+  +--------------------+  |
|       |       TwilioService       |        |       AgentService        |  |  ReferralsService  |  |
|       |  - Clinic credentials     |        |   (@langchain/langgraph)  |  |  (OpenAI / Gemini  |  |
|       |  - Inbound & Outbound     |        |   - English & French TTS  |  |   Extraction)      |  |
|       |  - SMS Confirmation/Reply |        |   - Triage Prompts        |  +---------+----------+  |
|       +---------------------------+        +-------------+-------------+            |             |
|                                                          |                          v             |
|                                  +-----------------------+-------+       +--------------------+   |
|                                  |                               |       |DistributionService |   |
|                                  v                               v       | (Workload Balancing|   |
|                    +---------------------------+   +-------------------+ +---------+----------+   |
|                    |     7 LangChain Tools     |   |   Google Gemini   |               |          |
|                    |   (Verify, Reschedule...) |   | & OpenAI Models   |               v          |
|                    +-------------+-------------+   +-------------------+   +--------------------+ |
|                                  |                                         |  WaitlistService   | |
|                      +-----------+-----------+                             | (Red/Blue Star     | |
|                      v                       v                             |  & Temp Holds)     | |
|            +-------------------+   +--------------------+                  +---------+----------+ |
|            |  PatientsService  |   |AppointmentsService |                            |            |
|            |  - Chart Logs     |   | - Priority Engine  |                            |            |
|            |  - Verification   |   | - Overbooking      |                            |            |
|            +---------+---------+   +---------+----------+                            |            |
|                      |                       |                                       |            |
+----------------------|-----------------------|---------------------------------------|------------+
                       v                       v                                       v
         +---------------------------------------------------------------------------------+
         |                          PostgreSQL Database (TypeORM)                          |
         |  - clinics (multi-tenant Twilio creds & numbers)                                |
         |  - physicians (specialties, daily quotas, active referral count)                |
         |  - patients (demographics, language, EMR chart logs)                            |
         |  - appointments (priority, overbooking authorization, reminder flags)           |
         |  - referrals (extracted clinical data, review status, workload scores)          |
         |  - waitlist_entries (Red/Blue stars, temporary holds, backfill candidates)      |
         |  - communication_logs (patient chart interaction records)                       |
         |  - ai_calls (JSONB transcripts & conversation history)                          |
         +---------------------------------------------------------------------------------+
                                |
                                v (Observability & Tracing)
         +---------------------------------------------------------------------------------+
         |                               LangSmith Platform                                |
         |   - Prompt traces, latency, token usage, tool invocation graphs                 |
         +---------------------------------------------------------------------------------+
```

---

## 2. Core Functional Pillars

### 2.1 Pillar 1: AI Calling Agent – Twilio Integration
* **Inbound & Outbound Calling**:
  - `POST /ai-call/start`: Initiates outbound automated appointment verification/scheduling call.
  - `POST /ai-call/twilio/incoming`: Webhook for incoming patient calls to clinic numbers with automatic caller ID identification and bilingual greeting.
* **Clinic-Specific Twilio Credentials**:
  - Multi-tenant architecture via `ClinicsModule` (`src/clinics/`).
  - Supports clinic-specific `twilioAccountSid`, `twilioAuthToken`, and dedicated `twilioPhoneNumber` (with system-level fallback).
* **English & French Calling Scripts**:
  - Turn 1 bilingual language selection (voice or keypad: Press 1 for English, Press 2 for French).
  - Neural Amazon Polly voices (`Polly.Danielle-Neural` for English, `Polly.Lea-Neural` for French).
  - Mid-call language switching support (Scenario 33).
* **Automated Voicemail & SMS (Scenario 3)**:
  - If call is unanswered (`no-answer`, `busy`, or answering machine), leaves approved medical secretary voicemail, sends SMS with response options, and marks patient `Awaiting Patient Response`.
* **Inbound SMS Webhook (`POST /ai-call/twilio/sms` - Scenarios 19 & 20)**:
  - Patient replies **YES** / **OUI** -> Books/confirms appointment and sends SMS receipt.
  - Patient replies **NO** / **NON** -> Cancels appointment, triggers waitlist backfill, and confirms via SMS.
  - Ambiguous replies ("Maybe", "What time?", "Can I come later?") -> Sends clarifying follow-up SMS and keeps slot held.

---

### 2.2 Pillar 2: AI-Powered Referral & Triage
* **OpenAI & Gemini Referral Extraction**:
  - `POST /referrals/extract`: Ingests unstructured referral notes, faxes, or OCR documents.
  - Structured extraction:
    - Patient demographics (name, DOB, phone, health card number).
    - Clinical details (primary complaint, symptoms, onset, diagnosis).
    - Clinical priority rating: `RED_STAR` (emergency/high urgency), `BLUE_STAR` (expedited), `URGENT`, `SEMI_URGENT`, `ROUTINE`.
    - Allowable clinical delay (target wait days: 2 days for Red Star, 7 days for Urgent, 30-60 days for Routine).
    - Referring physician details (name, billing number, contact/fax).
* **AI-Assisted Workload Distribution**:
  - `ReferralDistributionService`:
    - Automatically filters physicians by requested specialty (e.g. Cardiology, Internal Medicine, Family Medicine).
    - Evaluates physician workload capacity based on active referrals and daily appointment quotas.
    - Selects the physician with the lowest workload score, records assignment rationale, and increments physician's active referral count.
* **Physician Review & Clinical Priority Approval**:
  - `GET /referrals/pending-review`: Lists referrals awaiting clinical sign-off.
  - `POST /referrals/:id/review`: Allows physician to approve, modify priority (e.g. elevate to Red Star), adjust target wait days, reassign doctor, or reject.
  - Automatically documents review actions in patient chart.

---

### 2.3 Pillar 3: AI Appointment Scheduling & Automation
* **Automated Priority-Based Scheduling**:
  - `POST /appointments/priority`: Schedules patient within allowable clinical delay window matching physician specialty and clinical urgency.
* **Physician-Approved Overbooking**:
  - `POST /appointments/overbook`: Enables urgent patient appointments even when standard slots are full, requiring physician authorization (`overbookingApprovedBy`) and marking `isOverbooked: true`.
* **Waitlist Management & Star Tracking (Scenarios 10 & 11)**:
  - Priority queue ordered by:
    1. Star rating: `RED_STAR` (highest) -> `BLUE_STAR` -> `STANDARD`.
    2. Medical urgency.
    3. Date added to waitlist.
  - **Scenario 10 (Slot Backfilling)**: When an appointment is cancelled, waitlist engine finds top candidate.
  - **Scenario 11 (Temporary Holds)**: Places configurable 15-minute temporary hold on slot while offering to patient, preventing double booking and race conditions.
  - If patient declines or timeout expires: releases hold and immediately offers slot to next eligible candidate.
* **72-Hour Follow-Up & Reminder Automation**:
  - `POST /appointments/automation/run-72hr-followups`:
    - Evaluates unanswered calls > 72 hours old -> triggers Contact Attempt 2 (Scenario 6).
    - Evaluates Attempt 2 with no response > 72 hours -> marks `Unable to Reach Patient` (Scenario 7).
  - `POST /appointments/automation/run-reminders`:
    - 7 days before appointment: sends SMS reminder (Scenario 21).
    - 48–72 hours before: triggers confirmation request call/SMS (Scenario 21).
* **Physician Schedule Changes**:
  - `POST /appointments/clinic-cancellation` (Scenario 27): Identifies affected appointments, orders them by priority (Red Star / Urgent first), and triggers priority rescheduling.
  - `POST /appointments/physician-late` (Scenario 28): Proactively notifies upcoming patients of delay minutes with reschedule options.

---

### 2.4 Pillar 4: Patient Communication Log (EMR Chart Integration)
Every interaction between patient and AI agent is recorded in `communication_logs`:
* Timestamp & communication method (`PHONE`, `SMS`, `VOICEMAIL`).
* Identity verification status.
* Interaction reason & patient request.
* AI actions taken.
* Physician contacted and physician response (if applicable).
* Final workflow status and chart notes.
* Accessible via `GET /patients/:id/chart`.

---

## 3. API Endpoints Reference

### AI Calls & Telephony
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ai-call/start` | Start outbound AI telephone call |
| `GET` | `/ai-call/:id` | Get call status and metadata |
| `GET` | `/ai-call/:id/transcript` | Get full turn-by-turn conversation transcript |
| `POST` | `/ai-call/twilio/incoming` | Inbound voice webhook for patient incoming calls |
| `POST` | `/ai-call/twilio/sms` | Inbound SMS webhook for YES/NO/Ambiguous replies |
| `POST` | `/ai-call/twilio/voice` | Twilio conversational webhook (<Gather> / <Say>) |
| `POST` | `/ai-call/twilio/status` | Twilio call status callback (handles no-answer/voicemail) |
| `POST` | `/ai-call/twilio/poll` | Polling endpoint for complex LLM tool responses |

### Referrals & Clinical Triage
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/referrals/extract` | AI document extraction & triage with workload distribution |
| `GET` | `/referrals/pending-review` | List referrals awaiting physician review |
| `GET` | `/referrals` | List all referrals |
| `GET` | `/referrals/:id` | Get referral details and AI extraction JSON |
| `POST` | `/referrals/:id/review` | Physician reviews/approves clinical priority |

### Appointments & Automation
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/appointments` | List all appointments |
| `GET` | `/appointments/slots` | Get available slots for physician on date |
| `POST` | `/appointments/priority` | Automated scheduling based on priority & allowable delay |
| `POST` | `/appointments/overbook` | Physician-approved overbooking for urgent slots |
| `PATCH`| `/appointments/:id/confirm` | Confirm an appointment |
| `PATCH`| `/appointments/:id/cancel` | Cancel an appointment & trigger waitlist backfill |
| `PATCH`| `/appointments/:id/reschedule` | Reschedule an appointment |
| `POST` | `/appointments/clinic-cancellation` | Bulk reschedule affected patients for cancelled clinic |
| `POST` | `/appointments/physician-late` | Proactively notify patients of physician delay |
| `POST` | `/appointments/automation/run-72hr-followups` | Run 72-hour follow-up automation check |
| `POST` | `/appointments/automation/run-reminders` | Run 7-day & 48-72h reminder scan |

### Waitlist & Star Tracking
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/waitlist` | Add patient with Red Star / Blue Star priority |
| `GET` | `/waitlist` | Get prioritized waitlist queue |
| `POST` | `/waitlist/:id/hold` | Place temporary hold on slot (Scenario 11) |
| `POST` | `/waitlist/:id/accept` | Patient accepts earlier appointment offer |
| `POST` | `/waitlist/:id/decline` | Patient declines offer -> triggers next candidate |
| `POST` | `/waitlist/process-expired-holds` | Release expired holds |

### Clinics & Physicians
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/clinics` | List all clinics |
| `POST` | `/clinics` | Configure clinic with Twilio credentials & caller ID |
| `GET` | `/physicians` | List all physicians / filter by specialty |
| `POST` | `/physicians` | Add/update physician profile & max capacity |
| `GET` | `/patients/:id/chart` | Get full patient communication chart history |

---

## 4. Verification & Testing

Run unit tests across all 14 test suites:
```bash
npm test
```

Run TypeScript compilation check:
```bash
npm run build
```

Run database migration & seed:
```bash
npm run seed
```
