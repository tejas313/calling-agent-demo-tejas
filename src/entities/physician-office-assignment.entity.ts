import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('physician_office_assignments')
export class PhysicianOfficeAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'availability_slot_id', type: 'uuid', unique: true })
  availabilitySlotId: string;

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

  @Column({ type: 'integer', default: 0, nullable: true })
  isDraft: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  draftSessionId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  draftExpiresAt: Date | null;
}

