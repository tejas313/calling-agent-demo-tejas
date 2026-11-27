import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PatientProfile } from './patient-profile.entity';
import { Clinic } from './clinic.entity';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';
import { PhysicianPatientSlot } from './physician-patient-slot.entity';

@Entity('patient_appointment_bookings')
export class PatientAppointmentBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @ManyToOne(() => PatientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: PatientProfile;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'physician_profile_id', type: 'uuid' })
  physicianProfileId: string;

  @ManyToOne(() => PhysicianClinicProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'physician_profile_id' })
  physicianProfile: PhysicianClinicProfile;

  @Column({ name: 'patient_slot_id', type: 'uuid', nullable: true })
  patientSlotId: string | null;

  @ManyToOne(() => PhysicianPatientSlot, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'patient_slot_id' })
  patientSlot: PhysicianPatientSlot | null;

  @Column({ type: 'date' })
  appointmentDate: string;

  @Column({ type: 'varchar' })
  startTime: string;

  @Column({ type: 'varchar' })
  endTime: string;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @Column({ type: 'varchar', nullable: true })
  patientNote: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 1, nullable: true })
  bookedBy: number | null;

  @Column({ type: 'varchar', nullable: true })
  appointmentFormattedId: string | null;
}
