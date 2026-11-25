import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ClinicalPriority,
  ReferralStatus,
  ReviewStatus,
} from '../../common/constants';

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_name' })
  patientName: string;

  @Column({ name: 'patient_phone' })
  patientPhone: string;

  @Column({ name: 'patient_dob', type: 'date', nullable: true })
  patientDob: Date;

  @Column({ name: 'patient_id', nullable: true })
  patientId: string;

  @Column({ name: 'referring_physician_name' })
  referringPhysicianName: string;

  @Column({ name: 'referring_physician_billing_number', nullable: true })
  referringPhysicianBillingNumber: string;

  @Column({ name: 'referring_physician_contact', nullable: true })
  referringPhysicianContact: string;

  @Column({ name: 'referral_reason', type: 'text' })
  referralReason: string;

  @Column({ name: 'specialty_required' })
  specialtyRequired: string;

  @Column({
    name: 'clinical_priority',
    type: 'enum',
    enum: ClinicalPriority,
    default: ClinicalPriority.ROUTINE,
  })
  clinicalPriority: ClinicalPriority;

  @Column({ name: 'target_wait_days', default: 30 })
  targetWaitDays: number;

  @Column({ name: 'assigned_physician_id', nullable: true })
  assignedPhysicianId: string;

  @Column({ name: 'workload_score_at_assignment', type: 'float', nullable: true })
  workloadScoreAtAssignment: number;

  @Column({
    name: 'review_status',
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.PENDING_REVIEW,
  })
  reviewStatus: ReviewStatus;

  @Column({ name: 'physician_notes', type: 'text', nullable: true })
  physicianNotes: string;

  @Column({ name: 'extracted_data', type: 'jsonb', default: () => "'{}'" })
  extractedData: Record<string, any>;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.RECEIVED,
  })
  status: ReferralStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

