import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type AiCallLogLevel = 'INFO' | 'WARN' | 'ERROR';

@Entity('ai_call_logs')
@Index('IDX_ai_call_logs_call_id', ['callId'])
@Index('IDX_ai_call_logs_event_type', ['eventType'])
export class AiCallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'call_id', type: 'uuid', nullable: true })
  callId: string | null;

  @Column({ name: 'twilio_call_sid', type: 'varchar', nullable: true })
  twilioCallSid: string | null;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId: string | null;

  @Column({ name: 'assignments_id', type: 'uuid', nullable: true })
  assignmentsId: string | null;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType: string;

  @Column({ type: 'varchar', default: 'INFO' })
  level: AiCallLogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
