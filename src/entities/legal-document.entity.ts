import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('legal_documents')
export class LegalDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  type: number;

  @Column({ type: 'varchar', length: 50 })
  versionNumber: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'date' })
  effectiveDate: Date;

  @Column({ type: 'integer', default: 1 })
  status: number;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

