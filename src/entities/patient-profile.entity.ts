import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('patient_profiles')
export class PatientProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;

  @Column({ type: 'varchar' })
  firstName: string;

  @Column({ type: 'varchar' })
  lastName: string;

  @Column({ type: 'timestamp', nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  zipCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  healthCardNumber: string | null;

  @Column({ type: 'integer', default: 1, nullable: true })
  languageType: number | null;

  @Column({ type: 'integer', default: 1 })
  emailNotifications: number;

  @Column({ type: 'integer', default: 1 })
  smsNotifications: number;

  @Column({ type: 'integer', default: 0 })
  hasAcceptedTerms: number;

  @Column({ type: 'integer', default: 0 })
  isOnboardingComplete: number;

  @Column({ type: 'integer', default: 0 })
  lastCompletedStep: number;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

