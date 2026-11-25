import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('clinic_admin_clinics')
export class ClinicAdminClinic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', default: 0 })
  isPrimary: number;

  @Column({ type: 'integer', default: 0 })
  lastCompletedStep: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'clinic_admin_profile_id', type: 'uuid', nullable: true })
  clinicAdminProfileId: string | null;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;
}

