import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('office_availability')
@Index('IDX_office_avail_office_date_slot', ['officeId', 'date', 'clinicSlotId'])
export class OfficeAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar' })
  slotName: string;

  @Column({ type: 'varchar' })
  startTime: string;

  @Column({ type: 'varchar' })
  endTime: string;

  @Column({ type: 'integer', default: 1 })
  isEnabled: number;

  @Column({ type: 'integer', default: 0 })
  isOfficeNotAvailable: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'office_id', type: 'uuid', nullable: true })
  officeId: string | null;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;

  @Column({ name: 'clinic_slot_id', type: 'uuid', nullable: true })
  clinicSlotId: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ type: 'integer', default: 0, nullable: true })
  isDraft: number | null;
}

