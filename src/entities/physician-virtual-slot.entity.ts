import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';
import { Clinic } from './clinic.entity';

@Entity('physician_virtual_slots')
@Unique('IDX_phys_virtual_slot_uniq', ['physicianProfileId', 'clinicId', 'date', 'startTime'])
export class PhysicianVirtualSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'physician_profile_id', type: 'uuid' })
  physicianProfileId: string;

  @ManyToOne(() => PhysicianClinicProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'physician_profile_id' })
  physicianProfile: PhysicianClinicProfile;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

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
