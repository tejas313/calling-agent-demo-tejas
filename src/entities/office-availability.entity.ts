import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Office } from './office.entity';
import { Clinic } from './clinic.entity';
import { ClinicSlot } from './clinic-slot.entity';
import { User } from './user.entity';

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

  @ManyToOne(() => Office, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'office_id' })
  office: Office | null;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic | null;

  @Column({ name: 'clinic_slot_id', type: 'uuid', nullable: true })
  clinicSlotId: string | null;

  @ManyToOne(() => ClinicSlot, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'clinic_slot_id' })
  clinicSlot: ClinicSlot | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedByUser: User | null;

  @Column({ type: 'integer', default: 0, nullable: true })
  isDraft: number | null;
}
