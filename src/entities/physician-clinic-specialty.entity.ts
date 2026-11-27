import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';
import { Specialty } from './specialty.entity';

@Entity('physician_clinic_specialties')
export class PhysicianClinicSpecialty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'physician_clinic_profile_id', type: 'uuid', nullable: true })
  physicianClinicProfileId: string | null;

  @ManyToOne(() => PhysicianClinicProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'physician_clinic_profile_id' })
  physicianClinicProfile: PhysicianClinicProfile | null;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId: string | null;

  @ManyToOne(() => Specialty, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'specialty_id' })
  specialty: Specialty | null;
}
