import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('patients')
export class Patient {
  @PrimaryColumn() id: string;

  @Column() name: string;

  @Column({ unique: true }) phone: string;

  @Column({ name: 'date_of_birth', type: 'date' }) dateOfBirth: Date;

  @Column({ default: 'en' }) language: string;

  @Column({ name: 'clinic_id', nullable: true }) clinicId: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
