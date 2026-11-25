import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('specialty_consultation_types')
export class SpecialtyConsultationType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId: string | null;

  @Column({ name: 'consultation_type_id', type: 'uuid', nullable: true })
  consultationTypeId: string | null;
}

