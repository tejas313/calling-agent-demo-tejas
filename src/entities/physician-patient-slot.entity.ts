import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('physician_patient_slots')
@Index('IDX_pps_clinic_date', ['clinicId', 'date'])
@Index('IDX_pps_office_avail_physician', ['officeAvailabilityId', 'physicianProfileId'])
@Index('IDX_pps_physician_date', ['physicianProfileId', 'date'])
export class PhysicianPatientSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'office_availability_id', type: 'uuid' })
  officeAvailabilityId: string;

  @Column({ name: 'physician_profile_id', type: 'uuid' })
  physicianProfileId: string;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ name: 'physician_apt_type_id', type: 'uuid', nullable: true })
  physicianAptTypeId: string | null;

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

