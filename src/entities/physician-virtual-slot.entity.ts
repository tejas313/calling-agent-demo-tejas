import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('physician_virtual_slots')
@Unique('IDX_phys_virtual_slot_uniq', ['physicianProfileId', 'clinicId', 'date', 'startTime'])
export class PhysicianVirtualSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'physician_profile_id', type: 'uuid' })
  physicianProfileId: string;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ type: 'varchar', length: 10 })
  date: string;

  @Column({ type: 'varchar', length: 100 })
  slotName: string;

  @Column({ type: 'varchar', length: 20 })
  startTime: string;

  @Column({ type: 'varchar', length: 20 })
  endTime: string;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

