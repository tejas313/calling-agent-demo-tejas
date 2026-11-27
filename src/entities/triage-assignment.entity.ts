import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Clinic } from './clinic.entity';
import { PatientProfile } from './patient-profile.entity';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';
import { PhysicianAppointmentType } from './physician-appointment-type.entity';

@Entity('triage_assignments')
export class TriageAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @Column({ type: 'varchar', nullable: true })
  chiefComplaint: string | null;

  @Column({ type: 'varchar', nullable: true })
  priority: string | null;

  @Column({ type: 'varchar', nullable: true })
  declineReason: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic | null;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId: string | null;

  @ManyToOne(() => PatientProfile, { nullable: true })
  @JoinColumn({ name: 'patient_id' })
  patient: PatientProfile | null;

  @Column({ name: 'assigned_physician_id', type: 'uuid', nullable: true })
  assignedPhysicianId: string | null;

  @ManyToOne(() => PhysicianClinicProfile, { nullable: true })
  @JoinColumn({ name: 'assigned_physician_id' })
  assignedPhysician: PhysicianClinicProfile | null;

  @Column({ type: 'varchar', nullable: true })
  referralId: string | null;

  @Column({ type: 'varchar', nullable: true })
  referredBy: string | null;

  @Column({ type: 'integer', nullable: true })
  referredSource: number | null;

  @Column({ type: 'timestamp', nullable: true })
  referralDate: Date | null;

  @Column({ type: 'integer', default: 1 })
  activityStep: number;

  @Column({ type: 'integer', default: 0, nullable: true })
  isTriageApproved: number | null;

  @Column({ type: 'varchar', nullable: true })
  documentUrl: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approvedDate: Date | null;

  @Column({ type: 'integer', nullable: true })
  scheduleType: number | null;

  @Column({ type: 'integer', nullable: true })
  scheduleCount: number | null;

  @Column({ type: 'integer', nullable: true })
  scheduleUnit: number | null;

  @Column({ name: 'appointment_type_id', type: 'uuid', nullable: true })
  appointmentTypeId: string | null;

  @ManyToOne(() => PhysicianAppointmentType, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'appointment_type_id' })
  appointmentType: PhysicianAppointmentType | null;
}
