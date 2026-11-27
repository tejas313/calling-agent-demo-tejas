import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Clinic } from './clinic.entity';

@Entity('clinic_admin_profiles')
export class ClinicAdminProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  firstName: string;

  @Column({ type: 'varchar' })
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'integer', default: 2 })
  status: number;

  @Column({ name: 'invited_by_user_id', type: 'uuid', nullable: true })
  invitedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by_user_id' })
  invitedByUser: User | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  lastCompletedStep: number;

  @Column({ type: 'varchar', nullable: true })
  emrSystemName: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'user_id', type: 'uuid', unique: true, nullable: true })
  userId: string | null;

  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'onboarding_clinic_id', type: 'uuid', nullable: true })
  onboardingClinicId: string | null;

  @ManyToOne(() => Clinic, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'onboarding_clinic_id' })
  onboardingClinic: Clinic | null;

  @Column({ type: 'integer', default: 1, nullable: true })
  languageType: number | null;
}
