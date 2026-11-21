import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CallStatus, CallOutcome, CallType } from '../../common/constants';

export interface ConversationMessage {
  role: 'assistant' | 'user' | 'tool';
  content: string;
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: any;
}

@Entity('ai_calls')
export class AiCall {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'patient_id' }) patientId: string;

  @Column({ name: 'appointment_id' }) appointmentId: string;

  @Column({ name: 'clinic_id' }) clinicId: string;

  @Column({ name: 'phone_number' }) phoneNumber: string;

  @Column({ name: 'twilio_call_sid', nullable: true }) twilioCallSid: string;

  @Column({ default: 'en' }) language: string;

  @Column({
    name: 'call_type',
    type: 'enum',
    enum: CallType,
    default: CallType.APPOINTMENT_CONFIRMATION,
  })
  callType: CallType;

  @Column({ type: 'enum', enum: CallStatus, default: CallStatus.INITIATED }) status: CallStatus;

  @Column({ type: 'enum', enum: CallOutcome, nullable: true }) outcome: CallOutcome;

  @Column({ type: 'jsonb', default: [] }) transcript: ConversationMessage[];

  @Column({ name: 'conversation_history', type: 'jsonb', default: [] }) conversationHistory: any[];

  @Column({ name: 'current_turn', default: 0 }) currentTurn: number;

  @Column({ name: 'started_at', nullable: true }) startedAt: Date;

  @Column({ name: 'ended_at', nullable: true }) endedAt: Date;

  @Column({ nullable: true }) duration: number;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
