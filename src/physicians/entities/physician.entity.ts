import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('physicians')
export class Physician {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  specialty: string;

  @Column({ name: 'clinic_id' })
  clinicId: string;

  @Column({ name: 'max_daily_appointments', default: 20 })
  maxDailyAppointments: number;

  @Column({ name: 'active_referrals_count', default: 0 })
  activeReferralsCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

