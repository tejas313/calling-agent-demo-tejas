import { AiCall, ConversationMessage, PendingCallAction } from './ai-call.entity';
import { AiCallLog, AiCallLogLevel } from './ai-call-log.entity';
import { AppointmentType } from './appointment-type.entity';
import { ClinicAdminClinic } from './clinic-admin-clinic.entity';
import { ClinicAdminProfile } from './clinic-admin-profile.entity';
import { ClinicPhysician } from './clinic-physician.entity';
import { ClinicSetting } from './clinic-setting.entity';
import { ClinicSlot } from './clinic-slot.entity';
import { ClinicTriageConfiguration } from './clinic-triage-configuration.entity';
import { Clinic } from './clinic.entity';
import { ConsultationType } from './consultation-type.entity';
import { CryptoSession } from './crypto-session.entity';
import { LegalDocument } from './legal-document.entity';
import { OfficeAvailability } from './office-availability.entity';
import { OfficeSchedulePublish } from './office-schedule-publish.entity';
import { Office } from './office.entity';
import { PatientActivityLog } from './patient-activity-log.entity';
import { PatientAppointmentBooking } from './patient-appointment-booking.entity';
import { PatientAppointmentRequest } from './patient-appointment-request.entity';
import { PatientPhysicianAssignment } from './patient-physician-assignment.entity';
import { PatientProfile } from './patient-profile.entity';
import { PhysicianAppointmentType } from './physician-appointment-type.entity';
import { PhysicianAvailabilitySchedule } from './physician-availability-schedule.entity';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';
import { PhysicianClinicSpecialty } from './physician-clinic-specialty.entity';
import { PhysicianNotificationPreference } from './physician-notification-preference.entity';
import { PhysicianOfficeAssignment } from './physician-office-assignment.entity';
import { PhysicianPatientSlot } from './physician-patient-slot.entity';
import { PhysicianVirtualSlot } from './physician-virtual-slot.entity';
import { Specialty } from './specialty.entity';
import { SpecialtyConsultationType } from './specialty-consultation-type.entity';
import { TriageActivityLog } from './triage-activity-log.entity';
import { TriageAssignment } from './triage-assignment.entity';
import { UserSession } from './user-session.entity';
import { User } from './user.entity';

export {
  AiCall,
  AiCallLog,
  AiCallLogLevel,
  ConversationMessage,
  PendingCallAction,
  AppointmentType,
  ClinicAdminClinic,
  ClinicAdminProfile,
  ClinicPhysician,
  ClinicSetting,
  ClinicSlot,
  ClinicTriageConfiguration,
  Clinic,
  ConsultationType,
  CryptoSession,
  LegalDocument,
  OfficeAvailability,
  OfficeSchedulePublish,
  Office,
  PatientActivityLog,
  PatientAppointmentBooking,
  PatientAppointmentRequest,
  PatientPhysicianAssignment,
  PatientProfile,
  PhysicianAppointmentType,
  PhysicianAvailabilitySchedule,
  PhysicianClinicProfile,
  PhysicianClinicSpecialty,
  PhysicianNotificationPreference,
  PhysicianOfficeAssignment,
  PhysicianPatientSlot,
  PhysicianVirtualSlot,
  Specialty,
  SpecialtyConsultationType,
  TriageActivityLog,
  TriageAssignment,
  UserSession,
  User,
};

export const ALL_ENTITIES = [
  AiCall,
  AiCallLog,
  AppointmentType,
  ClinicAdminClinic,
  ClinicAdminProfile,
  ClinicPhysician,
  ClinicSetting,
  ClinicSlot,
  ClinicTriageConfiguration,
  Clinic,
  ConsultationType,
  CryptoSession,
  LegalDocument,
  OfficeAvailability,
  OfficeSchedulePublish,
  Office,
  PatientActivityLog,
  PatientAppointmentBooking,
  PatientAppointmentRequest,
  PatientPhysicianAssignment,
  PatientProfile,
  PhysicianAppointmentType,
  PhysicianAvailabilitySchedule,
  PhysicianClinicProfile,
  PhysicianClinicSpecialty,
  PhysicianNotificationPreference,
  PhysicianOfficeAssignment,
  PhysicianPatientSlot,
  PhysicianVirtualSlot,
  Specialty,
  SpecialtyConsultationType,
  TriageActivityLog,
  TriageAssignment,
  UserSession,
  User,
];
