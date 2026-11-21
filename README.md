# MediSchedule AI Call Agent — POC

![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![NestJS](https://img.shields.io/badge/NestJS-10-red) ![TypeScript](https://img.shields.io/badge/TypeScript-blue) ![LangChain.js](https://img.shields.io/badge/LangChain.js-orange) ![Gemini](https://img.shields.io/badge/Gemini-purple) ![LangSmith](https://img.shields.io/badge/LangSmith-black) ![Twilio](https://img.shields.io/badge/Twilio-red) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-blue)

## Table of Contents
1. [Architecture](#1-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Node.js Version](#3-nodejs-version)
4. [Installation](#4-installation)
5. [Environment Variables](#5-environment-variables)
6. [Google Gemini API Setup](#6-google-gemini-api-setup)
7. [LangSmith Setup](#7-langsmith-setup)
8. [Twilio Setup](#8-twilio-setup)
9. [Twilio Phone Number Configuration](#9-twilio-phone-number-configuration)
10. [ngrok Configuration](#10-ngrok-configuration)
11. [PostgreSQL Setup](#11-postgresql-setup)
12. [Database Migration](#12-database-migration)
13. [Seed Data](#13-seed-data)
14. [Running the NestJS Application](#14-running-the-nestjs-application)
15. [Starting an AI Call](#15-starting-an-ai-call)
16. [Testing the Call](#16-testing-the-call)
17. [Viewing LangSmith Traces](#17-viewing-langsmith-traces)
18. [Troubleshooting](#18-troubleshooting)
19. [Security Considerations](#19-security-considerations)

---

## 1. Architecture

The architecture relies on Twilio for handling voice communication, a NestJS backend to manage application logic and DB, and a LangChain ReAct agent leveraging Google Gemini to carry out conversational AI flows.

```mermaid
graph TD
  A[API Request /ai-call/start] -->|NestJS| B(Twilio Outbound Call)
  B -->|Patient Answers| C(Twilio Webhook /twilio/voice)
  C -->|NestJS handles logic| D[LangChain ReAct Agent]
  D <-->|Uses Tools| E[PostgreSQL DB via TypeORM]
  D <-->|Generates Response| F[Gemini API]
  D -->|Sends TwiML Response| C
  C -->|Plays Audio| B
  B -->|Speaks| Patient
```

**Module Structure:**
- `src/ai-call`: Orchestrates the call flows
- `src/appointments`: Appointment domain logic
- `src/patients`: Patient domain logic
- `src/langchain`: Agent definitions and Tool implementations
- `src/twilio`: Twilio API wrappers and Webhook controllers

---

## 2. Prerequisites
- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Docker & Docker Compose**
- **Google Cloud account** with Gemini API access
- **LangSmith account** (for observability)
- **Twilio account** with a registered phone number
- **ngrok** (for local webhook development)
- A real phone to test with

---

## 3. Node.js Version
Ensure you're using at least Node 20.
```bash
nvm use 20
```

---

## 4. Installation
Clone the repository and install the dependencies:
```bash
git clone <repo-url> medi-schedule-ai-call-agent-poc
cd medi-schedule-ai-call-agent-poc
npm install
cp .env.example .env
```
Edit `.env` with your actual credentials as outlined in the following steps.

---

## 5. Environment Variables
Below is a list of environment variables you need to configure in your `.env` file:

| Variable | Description | Example |
|---|---|---|
| `PORT` | The port the application runs on | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@localhost:5432/medidb` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | `ACxxxxx...` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | `xxxxxxxxx...` |
| `TWILIO_PHONE_NUMBER` | Your Twilio Phone Number | `+1234567890` |
| `GOOGLE_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `PUBLIC_BASE_URL` | ngrok URL for Twilio to send webhooks to | `https://xxxx.ngrok.io` |
| `LANGSMITH_TRACING` | Enable LangSmith tracing | `true` |
| `LANGSMITH_API_KEY` | LangSmith API Key | `ls__xxx...` |
| `LANGSMITH_PROJECT` | LangSmith Project Name | `medi-schedule-ai-call-agent` |

---

## 6. Google Gemini API Setup
1. Go to [Google AI Studio](https://aistudio.google.com).
2. Create a new API Key.
3. Set the key in `.env` as `GOOGLE_API_KEY`.

---

## 7. LangSmith Setup
1. Create an account at [smith.langchain.com](https://smith.langchain.com).
2. Create a new project called `medi-schedule-ai-call-agent`.
3. Generate an API Key from your settings.
4. Set `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT="medi-schedule-ai-call-agent"`, and `LANGSMITH_TRACING="true"`.

---

## 8. Twilio Setup
1. Create an account at [Twilio](https://www.twilio.com/).
2. From the Twilio Console, copy your **Account SID** and **Auth Token**.
3. Add them to `.env` as `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.

---

## 9. Twilio Phone Number Configuration
1. Buy or generate a Twilio Phone Number via the Console.
2. Add this number (E.164 format, e.g., `+1234567890`) to `.env` as `TWILIO_PHONE_NUMBER`.

---

## 10. ngrok Configuration
To allow Twilio to reach your local NestJS backend, use ngrok.
```bash
ngrok http 3000
```
Copy the secure `https` URL from ngrok's output and set it in `.env`:
```env
PUBLIC_BASE_URL=https://xxxx.ngrok.io
```
Note: Ensure Twilio webhooks are configured to use this URL internally or via dashboard for inbound routes (if any).

---

## 11. PostgreSQL Setup
Using Docker Compose:
```bash
docker-compose up -d
```
This runs a local PostgreSQL instance.

---

## 12. Database Migration
Run migrations to set up the schema:
```bash
npm run migration:run
```
*(In development mode, TypeORM may be configured to `synchronize: true`, which handles schemas automatically. Use migrations for production-ready setups.)*

---

## 13. Seed Data
Populate the local DB with test records:
```bash
npm run seed
```
This will insert demo records like `PAT-001`, `APT-001`, etc.

---

## 14. Running the NestJS Application
Start the development server:
```bash
npm run start:dev
```
Swagger UI will be available at `http://localhost:3000/api`.

---

## 15. Starting an AI Call
To initiate an outbound call, trigger the `POST /ai-call/start` endpoint.

Example cURL:
```bash
curl -X POST http://localhost:3000/ai-call/start \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumber": "+14165551234",
    "patientId": "PAT-001",
    "clinicId": "CLINIC-001",
    "appointmentId": "APT-001",
    "language": "en",
    "callType": "appointment_confirmation"
  }'
```
You can also use the Swagger UI demo at `http://localhost:3000/api`.

---

## 16. Testing the Call
Try these 6 demo scenarios using seeded data:
1. **Patient confirms**: Use `PAT-001`, `APT-001`. The agent asks to confirm, you say "yes", tool `confirmAppointment` runs.
2. **Patient cancels**: Use `PAT-002`, `APT-003`. Say you can't make it. Agent runs `cancelAppointment`.
3. **Patient reschedules**: Use `PAT-003`, `APT-005`. Ask to change the time. Agent runs `getAvailableSlots` then `rescheduleAppointment`.
4. **Patient asks to call later**: Use `PAT-004`, `APT-007`. Tell the agent you are busy.
5. **Patient cannot be verified**: Enter a wrong phone number in the request. Agent handles the failure.
6. **Appointment not found**: Send `APT-999` (invalid). Agent gracefully handles the missing data.

---

## 17. Viewing LangSmith Traces
Monitor your agent's thought process, prompts, and tool calls:
1. Go to [smith.langchain.com](https://smith.langchain.com).
2. Open the project `medi-schedule-ai-call-agent`.
3. View traces with full metadata and tool invocations.

---

## 18. Troubleshooting
- **Twilio webhook not reached**: Verify ngrok is running and `PUBLIC_BASE_URL` is set correctly. Check Twilio console error logs.
- **Gemini API error**: Ensure `GOOGLE_API_KEY` is valid.
- **LangSmith not tracing**: Ensure `LANGSMITH_TRACING=true` and API key is correct.
- **DB connection failed**: Verify `docker-compose up -d` is running and `DATABASE_URL` is correct.
- **Call goes straight to voicemail**: Retry the call, this happens often with trial numbers.
- **TypeScript errors**: Run `npm run build` to catch compile-time issues.

---

## 19. Security Considerations
- **Never commit `.env` files** to version control.
- Ensure **Twilio webhook signature validation** is enabled in production.
- Use **Rate Limiting** on `/ai-call/start` to prevent spam/abuse.
- Ensure **No PHI (Protected Health Information) is stored** in non-compliant ways. (This POC uses mock data).
- Ensure all sensitive data (API keys) are injected via Environment Variables.
- Error responses should **never expose application secrets**.
- Logs must be appropriately sanitized of patient data in production.

---
