import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CallStatus, CallOutcome, CallDirection } from '../../common/constants';

export interface TranscriptEntry {
  role: 'agent' | 'patient';
  text: string;
  timestamp: string;
  confidence?: number;
}

export interface ConversationMessage {
  type: 'system' | 'human' | 'ai';
  content: string;
}

@Entity('ai_calls')
export class AiCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'appointment_id', nullable: true })
  appointmentId: string;

  @Column({ name: 'clinic_id', default: 'CLINIC-001' })
  clinicId: string;

  @Column({ name: 'phone_number' })
  phoneNumber: string;

  @Column({ name: 'twilio_call_sid', nullable: true })
  twilioCallSid: string;

  @Column({
    type: 'enum',
    enum: CallDirection,
    default: CallDirection.OUTBOUND,
  })
  direction: CallDirection;

  @Column({ default: 'en' })
  language: string;

  @Column({ name: 'call_type', default: 'appointment_confirmation' })
  callType: string;

  @Column({
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.INITIATED,
  })
  status: CallStatus;

  @Column({
    type: 'enum',
    enum: CallOutcome,
    nullable: true,
  })
  outcome: CallOutcome;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  transcript: TranscriptEntry[];

  @Column({
    name: 'conversation_history',
    type: 'jsonb',
    default: () => "'[]'",
  })
  conversationHistory: ConversationMessage[];

  @Column({ name: 'current_turn', default: 0 })
  currentTurn: number;

  @Column({ name: 'started_at', nullable: true })
  startedAt: Date;

  @Column({ name: 'ended_at', nullable: true })
  endedAt: Date;

  @Column({ nullable: true })
  duration: number;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
