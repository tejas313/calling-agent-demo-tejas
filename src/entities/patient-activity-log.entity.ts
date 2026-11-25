import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('patient_activity_logs')
export class PatientActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ name: 'performed_by_user_id', type: 'uuid', nullable: true })
  performedByUserId: string | null;

  @Column({ name: 'activity_type', type: 'varchar' })
  activityType: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ name: 'activity_time', type: 'time', nullable: true })
  activityTime: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

