import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('office_schedule_publish')
@Unique('IDX_office_schedule_publish_office_month', ['officeId', 'month'])
export class OfficeSchedulePublish {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 7 })
  month: string;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'office_id', type: 'uuid', nullable: true })
  officeId: string | null;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;

  @Column({ name: 'published_by_user_id', type: 'uuid', nullable: true })
  publishedByUserId: string | null;
}

