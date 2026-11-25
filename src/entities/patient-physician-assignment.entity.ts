import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('patient_physician_assignments')
export class PatientPhysicianAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', default: 1 })
  isPrimary: number;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId: string | null;

  @Column({ name: 'physician_profile_id', type: 'uuid', nullable: true })
  physicianProfileId: string | null;
}

