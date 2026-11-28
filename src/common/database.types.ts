import { CallStatus, CallOutcome, CallType } from './constants';

export interface ConversationMessage {
  role: 'assistant' | 'user' | 'tool';
  content: string;
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: any;
}

export type PendingCallAction = 'CONFIRM' | 'CANCEL' | null;

export type AiCallLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface PatientProfile {
  id: string;
  userId?: string;
  clinicId?: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  zipCode?: string | null;
  healthCardNumber?: string | null;
  languageType?: number | null;
  emailNotifications?: number;
  smsNotifications?: number;
  hasAcceptedTerms?: number;
  isOnboardingComplete?: number;
  lastCompletedStep?: number;
  isActive?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AiCall {
  id: string;
  patientId: string;
  assignmentsId?: string | null;
  assignedPhysicianId?: string | null;
  slotId?: string | null;
  appointmentId?: string | null;
  clinicId: string;
  phoneNumber: string;
  twilioCallSid?: string | null;
  language: string;
  callType: CallType;
  status: CallStatus;
  outcome?: CallOutcome | null;
  transcript: ConversationMessage[];
  conversationHistory: any[];
  currentTurn: number;
  pendingAction?: PendingCallAction;
  callReason?: string | null;
  lastError?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  duration?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AiCallLog {
  id: string;
  callId?: string | null;
  twilioCallSid?: string | null;
  patientId?: string | null;
  assignmentsId?: string | null;
  eventType: string;
  level: AiCallLogLevel;
  message: string;
  details?: Record<string, any> | null;
  createdAt?: Date;
}

export interface TriageAssignment {
  id: string;
  status?: number;
  chiefComplaint?: string | null;
  priority?: string | null;
  declineReason?: string | null;
  clinicId?: string | null;
  patientId?: string | null;
  assignedPhysicianId?: string | null;
  referralId?: string | null;
  referredBy?: string | null;
  referredSource?: number | null;
  referralDate?: Date | null;
  activityStep?: number;
  isTriageApproved?: number | null;
  documentUrl?: string | null;
  approvedDate?: Date | string | null;
  scheduleType?: number | null;
  scheduleCount?: number | null;
  scheduleUnit?: number | null;
  appointmentTypeId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PhysicianClinicProfile {
  id: string;
  firstName: string;
  lastName: string;
  bio?: string | null;
  profilePictureUrl?: string | null;
  phone?: string | null;
  status?: number;
  invitedByUserId?: string | null;
  expiresAt?: Date | null;
  isOnboardingComplete?: number;
  userId?: string | null;
  clinicId: string;
  languageType?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PhysicianPatientSlot {
  id: string;
  officeAvailabilityId?: string;
  physicianProfileId: string;
  clinicId: string;
  physicianAptTypeId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  mode?: number;
  status: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PatientAppointmentBooking {
  id: string;
  patientId: string;
  clinicId: string;
  physicianProfileId: string;
  patientSlotId?: string | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: number;
  patientNote?: string | null;
  bookedBy?: number | null;
  appointmentFormattedId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Clinic {
  id: string;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  status?: number;
  isActive?: number;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export interface OfficeAvailability {
  id: string;
  date: string;
  slotName: string;
  startTime: string;
  endTime: string;
  isEnabled?: number;
  isOfficeNotAvailable?: number;
  officeId?: string | null;
  clinicId?: string | null;
  office?: {
    name?: string;
    address?: string;
    phone?: string;
  } | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PhysicianAppointmentType {
  id: string;
  customName?: string | null;
  isPhysicianCustom?: boolean;
  priority?: number;
  maxPerDay?: number | null;
  durationMinutes?: number;
  mode?: number;
  allowOverbook?: number;
  isActive?: number;
  specialtyId?: string | null;
  consultationTypeId?: string | null;
  consultationType?: { name: string } | null;
  specialty?: { name: string } | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PhysicianClinicSpecialty {
  id: string;
  physicianClinicProfileId?: string | null;
  specialtyId?: string | null;
  specialty?: { name: string } | null;
  createdAt?: Date;
}
