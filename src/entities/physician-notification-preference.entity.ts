import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';

@Entity('physician_notification_preferences')
export class PhysicianNotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', default: 1 })
  emailNotifications: number;

  @Column({ type: 'integer', default: 1 })
  smsNotifications: number;

  @Column({ type: 'integer', default: 1 })
  pushNotifications: number;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'physician_profile_id', type: 'uuid', unique: true, nullable: true })
  physicianProfileId: string | null;

  @OneToOne(() => PhysicianClinicProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'physician_profile_id' })
  physicianProfile: PhysicianClinicProfile | null;

  @Column({ type: 'integer', default: 1 })
  redStarPatientAlert: number;
}
