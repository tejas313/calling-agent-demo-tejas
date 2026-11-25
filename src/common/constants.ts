// This file is the canonical constants file.
// All source files import from here (e.g. '../common/constants' or '../../common/constants').

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  NO_SHOW = 'NO_SHOW',
  HELD = 'HELD', // Temporary hold for waitlist
}

export enum CallStatus {
  INITIATED = 'INITIATED',
  RINGING = 'RINGING',
  ANSWERED = 'ANSWERED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  NO_ANSWER = 'NO_ANSWER',
  VOICEMAIL = 'VOICEMAIL',
  AWAITING_RESPONSE = 'AWAITING_RESPONSE',
  CONTACT_ATTEMPT_2 = 'CONTACT_ATTEMPT_2',
  UNABLE_TO_REACH = 'UNABLE_TO_REACH',
}

export enum CallOutcome {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  CALL_LATER = 'CALL_LATER',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  DECLINED = 'DECLINED',
  VOICEMAIL_LEFT = 'VOICEMAIL_LEFT',
  UNREACHABLE = 'UNREACHABLE',
  TRIAGED = 'TRIAGED',
}

export enum CallDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

export enum CallType {
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
  APPOINTMENT_CANCELLATION = 'appointment_cancellation',
  APPOINTMENT_RESCHEDULE = 'appointment_reschedule',
  WAITLIST_OFFER = 'waitlist_offer',
  CLINIC_CANCELLED = 'clinic_cancelled',
  PHYSICIAN_LATE = 'physician_late',
  INCOMING_PATIENT_CALL = 'incoming_patient_call',
  FOLLOW_UP_72HR = 'follow_up_72hr',
}

export enum Intent {
  CONFIRM_APPOINTMENT = 'CONFIRM_APPOINTMENT',
  CANCEL_APPOINTMENT = 'CANCEL_APPOINTMENT',
  RESCHEDULE_APPOINTMENT = 'RESCHEDULE_APPOINTMENT',
  CALL_LATER = 'CALL_LATER',
  ROUTINE_APPOINTMENT = 'ROUTINE_APPOINTMENT',
  URGENT_TRIAGE = 'URGENT_TRIAGE',
  PRESCRIPTION_REFILL = 'PRESCRIPTION_REFILL',
  UNKNOWN = 'UNKNOWN',
}

export enum Language {
  EN = 'en',
  FR = 'fr',
}

export enum ClinicalPriority {
  RED_STAR = 'RED_STAR',     // Urgent priority, tight delay (e.g., < 48-72h)
  BLUE_STAR = 'BLUE_STAR',   // High priority / expedited (e.g., < 7-14 days)
  URGENT = 'URGENT',         // Urgent clinical need
  SEMI_URGENT = 'SEMI_URGENT',// Semi-urgent
  ROUTINE = 'ROUTINE',       // Routine scheduling (e.g., 30-60 days)
}

export enum StarRating {
  RED_STAR = 'RED_STAR',
  BLUE_STAR = 'BLUE_STAR',
  STANDARD = 'STANDARD',
}

export enum ReferralStatus {
  RECEIVED = 'RECEIVED',
  TRIAGED = 'TRIAGED',
  SCHEDULED = 'SCHEDULED',
  ARCHIVED = 'ARCHIVED',
}

export enum ReviewStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  MODIFIED = 'MODIFIED',
  REJECTED = 'REJECTED',
}

export enum WaitlistStatus {
  WAITING = 'WAITING',
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export enum CommunicationMethod {
  PHONE = 'PHONE',
  SMS = 'SMS',
  VOICEMAIL = 'VOICEMAIL',
}

export const SUPPORTED_LANGUAGES: string[] = ['en', 'fr'];
export const DEFAULT_LANGUAGE = 'en';
export const MAX_CALL_TURNS = 10;
export const VOICE_LANGUAGE_MAP: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
};
