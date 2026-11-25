import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clinic_settings')
export class ClinicSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', default: 15 })
  defaultAppointmentDurationMinutes: number;

  @Column({ type: 'varchar', default: 'America/New_York' })
  timezone: string;

  @Column({ type: 'integer', default: 1 })
  autoConfirmAppointments: number;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'clinic_id', type: 'uuid', unique: true, nullable: true })
  clinicId: string | null;
}

