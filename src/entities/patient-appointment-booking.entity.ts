import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('patient_appointment_bookings')
export class PatientAppointmentBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ name: 'physician_profile_id', type: 'uuid' })
  physicianProfileId: string;

  @Column({ name: 'patient_slot_id', type: 'uuid', nullable: true })
  patientSlotId: string | null;

  @Column({ type: 'date' })
  appointmentDate: string;

  @Column({ type: 'varchar' })
  startTime: string;

  @Column({ type: 'varchar' })
  endTime: string;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @Column({ type: 'varchar', nullable: true })
  patientNote: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 1, nullable: true })
  bookedBy: number | null;

  @Column({ type: 'varchar', nullable: true })
  appointmentFormattedId: string | null;
}

