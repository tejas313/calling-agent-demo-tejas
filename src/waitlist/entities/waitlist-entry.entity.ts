import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ClinicalPriority,
  StarRating,
  WaitlistStatus,
} from '../../common/constants';

@Entity('waitlist_entries')
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'physician_id', nullable: true })
  physicianId: string;

  @Column({ name: 'clinic_id' })
  clinicId: string;

  @Column({ name: 'appointment_type' })
  appointmentType: string;

  @Column({
    type: 'enum',
    enum: ClinicalPriority,
    default: ClinicalPriority.ROUTINE,
  })
  priority: ClinicalPriority;

  @Column({
    name: 'star_rating',
    type: 'enum',
    enum: StarRating,
    default: StarRating.STANDARD,
  })
  starRating: StarRating;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate: Date;

  @Column({
    type: 'enum',
    enum: WaitlistStatus,
    default: WaitlistStatus.WAITING,
  })
  status: WaitlistStatus;

  @Column({ name: 'current_appointment_id', nullable: true })
  currentAppointmentId: string;

  @Column({ name: 'temporary_hold_until', type: 'timestamp', nullable: true })
  temporaryHoldUntil: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

