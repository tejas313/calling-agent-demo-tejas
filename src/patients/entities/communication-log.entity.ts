import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { CommunicationMethod } from '../../common/constants';

@Entity('communication_logs')
export class CommunicationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @CreateDateColumn({ name: 'date_time' })
  dateTime: Date;

  @Column({
    name: 'communication_method',
    type: 'enum',
    enum: CommunicationMethod,
    default: CommunicationMethod.PHONE,
  })
  communicationMethod: CommunicationMethod;

  @Column({ default: false })
  verified: boolean;

  @Column({ name: 'interaction_reason', nullable: true })
  interactionReason: string;

  @Column({ name: 'patient_request', type: 'text', nullable: true })
  patientRequest: string;

  @Column({ name: 'ai_actions', type: 'text', nullable: true })
  aiActions: string;

  @Column({ name: 'appointment_offered', nullable: true })
  appointmentOffered: string;

  @Column({ name: 'patient_response', type: 'text', nullable: true })
  patientResponse: string;

  @Column({ name: 'physician_contacted', nullable: true })
  physicianContacted: string;

  @Column({ name: 'physician_response', type: 'text', nullable: true })
  physicianResponse: string;

  @Column({ name: 'final_action', nullable: true })
  finalAction: string;

  @Column({ name: 'escalation_status', nullable: true })
  escalationStatus: string;

  @Column({ name: 'final_workflow_status', nullable: true })
  finalWorkflowStatus: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;
}

