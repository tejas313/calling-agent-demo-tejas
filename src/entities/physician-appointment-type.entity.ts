import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('physician_appointment_types')
export class PhysicianAppointmentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'physician_profile_id', type: 'uuid', nullable: true })
  physicianProfileId: string | null;

  @Column({ name: 'custom_name', type: 'varchar', nullable: true })
  customName: string | null;

  @Column({ name: 'is_physician_custom', type: 'boolean', default: false })
  isPhysicianCustom: boolean;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @Column({ name: 'max_per_day', type: 'integer', nullable: true })
  maxPerDay: number | null;

  @Column({ name: 'duration_minutes', type: 'integer', default: 30 })
  durationMinutes: number;

  @Column({ type: 'integer', default: 3 })
  mode: number;

  @Column({ name: 'allow_overbook', type: 'integer', default: 0 })
  allowOverbook: number;

  @Column({ name: 'is_active', type: 'integer', default: 1 })
  isActive: number;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId: string | null;

  @Column({ name: 'consultation_type_id', type: 'uuid', nullable: true })
  consultationTypeId: string | null;
}

