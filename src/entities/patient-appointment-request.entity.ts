import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('patient_appointment_requests')
export class PatientAppointmentRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ name: 'physician_profile_id', type: 'uuid', nullable: true })
  physicianProfileId: string | null;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', nullable: true })
  requestNumber: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

