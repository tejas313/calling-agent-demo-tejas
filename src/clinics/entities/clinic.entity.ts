import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('clinics')
export class Clinic {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'twilio_account_sid', nullable: true })
  twilioAccountSid: string;

  @Column({ name: 'twilio_auth_token', nullable: true })
  twilioAuthToken: string;

  @Column({ name: 'twilio_phone_number', nullable: true })
  twilioPhoneNumber: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

