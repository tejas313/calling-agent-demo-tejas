import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('clinic_physicians')
@Unique('IDX_clinic_physicians_user_clinic', ['userId', 'clinicId'])
export class ClinicPhysician {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'physician_profile_id', type: 'uuid' })
  physicianProfileId: string;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;
}

