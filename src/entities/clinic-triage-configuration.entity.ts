import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Clinic } from './clinic.entity';

@Entity('clinic_triage_configuration')
export class ClinicTriageConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  referralEmail: string | null;

  @Column({ type: 'text', nullable: true })
  portalWidgetScript: string | null;

  @Column({ type: 'varchar', nullable: true })
  twilioNumber: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'clinic_id', type: 'uuid', unique: true, nullable: true })
  clinicId: string | null;

  @OneToOne(() => Clinic, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic | null;
}
