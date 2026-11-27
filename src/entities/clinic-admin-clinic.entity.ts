import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Clinic } from './clinic.entity';
import { ClinicAdminProfile } from './clinic-admin-profile.entity';

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

  @ManyToOne(() => ClinicAdminProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'clinic_admin_profile_id' })
  clinicAdminProfile: ClinicAdminProfile | null;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic | null;
}
