import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PatientProfile } from './patient-profile.entity';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';

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

  @ManyToOne(() => PatientProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'patient_id' })
  patient: PatientProfile | null;

  @Column({ name: 'physician_profile_id', type: 'uuid', nullable: true })
  physicianProfileId: string | null;

  @ManyToOne(() => PhysicianClinicProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'physician_profile_id' })
  physicianProfile: PhysicianClinicProfile | null;
}
