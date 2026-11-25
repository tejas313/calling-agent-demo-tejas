import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('physician_availability_schedules')
export class PhysicianAvailabilitySchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'smallint' })
  dayOfWeek: number;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'physician_profile_id', type: 'uuid', nullable: true })
  physicianProfileId: string | null;

  @Column({ name: 'office_id', type: 'uuid', nullable: true })
  officeId: string | null;
}

