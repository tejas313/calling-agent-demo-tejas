import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { AppointmentStatus } from '../../common/constants';

@Entity('appointments')
export class Appointment {
  @PrimaryColumn() id: string;

  @Column({ name: 'patient_id' }) patientId: string;

  @Column({ name: 'clinic_id' }) clinicId: string;

  @Column({ name: 'physician_id' }) physicianId: string;

  @Column({ type: 'date' }) date: Date;

  @Column() time: string;

  @Column({ name: 'appointment_type' }) appointmentType: string;

  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.PENDING })
  status: AppointmentStatus;

  @Column({ nullable: true }) notes: string;

  @Column({ name: 'callback_time', nullable: true }) callbackTime: string;

  @Column({ name: 'cancel_reason', nullable: true }) cancelReason: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
