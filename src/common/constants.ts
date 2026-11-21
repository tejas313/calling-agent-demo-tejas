// This file is the canonical constants file.
// All source files import from here (e.g. '../common/constants' or '../../common/constants').

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  NO_SHOW = 'NO_SHOW',
}

export enum CallStatus {
  INITIATED = 'INITIATED',
  RINGING = 'RINGING',
  ANSWERED = 'ANSWERED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  NO_ANSWER = 'NO_ANSWER',
}

export enum CallOutcome {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  CALL_LATER = 'CALL_LATER',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

export enum CallType {
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
}

export enum Intent {
  CONFIRM_APPOINTMENT = 'CONFIRM_APPOINTMENT',
  CANCEL_APPOINTMENT = 'CANCEL_APPOINTMENT',
  RESCHEDULE_APPOINTMENT = 'RESCHEDULE_APPOINTMENT',
  CALL_LATER = 'CALL_LATER',
  UNKNOWN = 'UNKNOWN',
}

export enum Language {
  EN = 'en',
  FR = 'fr',
}

export const SUPPORTED_LANGUAGES: string[] = ['en', 'fr'];
export const DEFAULT_LANGUAGE = 'en';
export const MAX_CALL_TURNS = 10;
export const VOICE_LANGUAGE_MAP: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
};
