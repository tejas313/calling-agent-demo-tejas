import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'integer', default: 1 })
  redStarPatientAlert: number;
}

