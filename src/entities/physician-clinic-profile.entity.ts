import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('physician_clinic_profiles')
export class PhysicianClinicProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  firstName: string;

  @Column({ type: 'varchar' })
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', nullable: true })
  profilePictureUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @Column({ name: 'invited_by_user_id', type: 'uuid', nullable: true })
  invitedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  isOnboardingComplete: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ type: 'integer', default: 1, nullable: true })
  languageType: number | null;
}

