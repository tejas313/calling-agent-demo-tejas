import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('physician_clinic_specialties')
export class PhysicianClinicSpecialty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'physician_clinic_profile_id', type: 'uuid', nullable: true })
  physicianClinicProfileId: string | null;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId: string | null;
}

