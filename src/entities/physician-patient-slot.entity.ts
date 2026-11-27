import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OfficeAvailability } from './office-availability.entity';
import { PhysicianClinicProfile } from './physician-clinic-profile.entity';
import { Clinic } from './clinic.entity';
import { PhysicianAppointmentType } from './physician-appointment-type.entity';

@Entity('physician_patient_slots')
@Index('IDX_pps_clinic_date', ['clinicId', 'date'])
@Index('IDX_pps_office_avail_physician', ['officeAvailabilityId', 'physicianProfileId'])
@Index('IDX_pps_physician_date', ['physicianProfileId', 'date'])
export class PhysicianPatientSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'office_availability_id', type: 'uuid' })
  officeAvailabilityId: string;

  @ManyToOne(() => OfficeAvailability, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'office_availability_id' })
  officeAvailability: OfficeAvailability;

  @Column({ name: 'physician_profile_id', type: 'uuid' })
  physicianProfileId: string;

  @ManyToOne(() => PhysicianClinicProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'physician_profile_id' })
  physicianProfile: PhysicianClinicProfile;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'physician_apt_type_id', type: 'uuid', nullable: true })
  physicianAptTypeId: string | null;

  @ManyToOne(() => PhysicianAppointmentType, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'physician_apt_type_id' })
  physicianAptType: PhysicianAppointmentType | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar' })
  startTime: string;

  @Column({ type: 'varchar' })
  endTime: string;

  @Column({ type: 'integer', default: 3 })
  mode: number;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
