import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'integer' })
  role: number;

  @Column({ type: 'integer', default: 1 })
  isActive: number;

  @Column({ type: 'integer', default: 0 })
  isEmailVerified: number;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'text', nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'varchar', length: 6, nullable: true })
  otpCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExpiresAt: Date | null;

  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'nomad_account_id', type: 'varchar', length: 255, nullable: true })
  nomadAccountId: string | null;

  @Column({ name: 'nomad_account_synced_at', type: 'timestamp', nullable: true })
  nomadAccountSyncedAt: Date | null;

  @Column({ name: 'nomad_entitlement_checked_at', type: 'timestamp', nullable: true })
  nomadEntitlementCheckedAt: Date | null;

  @Column({ name: 'entra_display_name', type: 'varchar', length: 255, nullable: true })
  entraDisplayName: string | null;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;
}

