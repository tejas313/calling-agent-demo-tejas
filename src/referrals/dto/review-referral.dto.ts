import { IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ClinicalPriority } from '../../common/constants';

export class ReviewReferralDto {
  @ApiProperty({
    enum: ClinicalPriority,
    example: ClinicalPriority.RED_STAR,
    description: 'Physician-reviewed clinical priority level',
    required: false,
  })
  @IsOptional()
  @IsEnum(ClinicalPriority)
  clinicalPriority?: ClinicalPriority;

  @ApiProperty({ example: 7, description: 'Target max delay in days', required: false })
  @IsOptional()
  @IsNumber()
  targetWaitDays?: number;

  @ApiProperty({ example: 'PHY-001', description: 'Reassign to specific physician', required: false })
  @IsOptional()
  @IsString()
  assignedPhysicianId?: string;

  @ApiProperty({ example: 'Approved for urgent evaluation within 48h. Red star priority confirmed.', required: false })
  @IsOptional()
  @IsString()
  physicianNotes?: string;

  @ApiProperty({ example: 'APPROVE', enum: ['APPROVE', 'MODIFY', 'REJECT'] })
  @IsString()
  action: 'APPROVE' | 'MODIFY' | 'REJECT';
}

