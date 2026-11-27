import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TriageAssignment } from './triage-assignment.entity';
import { User } from './user.entity';

@Entity('triage_activity_logs')
export class TriageActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', nullable: true })
  fromStatus: number | null;

  @Column({ type: 'integer' })
  toStatus: number;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'triage_assignment_id', type: 'uuid', nullable: true })
  triageAssignmentId: string | null;

  @ManyToOne(() => TriageAssignment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'triage_assignment_id' })
  triageAssignment: TriageAssignment | null;

  @Column({ name: 'performed_by_user_id', type: 'uuid', nullable: true })
  performedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'performed_by_user_id' })
  performedByUser: User | null;

  @Column({ type: 'time', nullable: true })
  activityTime: string | null;
}
