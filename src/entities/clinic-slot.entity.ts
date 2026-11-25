import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clinic_slots')
export class ClinicSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  startTime: string;

  @Column({ type: 'varchar' })
  endTime: string;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;
}

