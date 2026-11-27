import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Specialty } from './specialty.entity';
import { ConsultationType } from './consultation-type.entity';

@Entity('specialty_consultation_types')
export class SpecialtyConsultationType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId: string | null;

  @ManyToOne(() => Specialty, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'specialty_id' })
  specialty: Specialty | null;

  @Column({ name: 'consultation_type_id', type: 'uuid', nullable: true })
  consultationTypeId: string | null;

  @ManyToOne(() => ConsultationType, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'consultation_type_id' })
  consultationType: ConsultationType | null;
}
