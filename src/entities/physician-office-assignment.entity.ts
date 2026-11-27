import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { OfficeAvailability } from './office-availability.entity';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';
import { Office } from './office.entity';

@Entity('physician_office_assignments')
export class PhysicianOfficeAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'availability_slot_id', type: 'uuid', unique: true })
  availabilitySlotId: string;

  @OneToOne(() => OfficeAvailability, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'availability_slot_id' })
  availabilitySlot: OfficeAvailability;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'physician_profile_id', type: 'uuid', nullable: true })
  physicianProfileId: string | null;

  @ManyToOne(() => PhysicianClinicProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'physician_profile_id' })
  physicianProfile: PhysicianClinicProfile | null;

  @Column({ name: 'office_id', type: 'uuid', nullable: true })
  officeId: string | null;

  @ManyToOne(() => Office, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'office_id' })
  office: Office | null;

  @Column({ type: 'integer', default: 0, nullable: true })
  isDraft: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  draftSessionId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  draftExpiresAt: Date | null;
}
