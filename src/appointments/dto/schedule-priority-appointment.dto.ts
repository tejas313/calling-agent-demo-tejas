import { IsString, IsNotEmpty, IsDateString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ClinicalPriority } from '../../common/constants';

export class SchedulePriorityAppointmentDto {
  @ApiProperty({ example: 'PAT-001' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'CLINIC-001' })
  @IsString()
  @IsNotEmpty()
  clinicId: string;

  @ApiProperty({ example: 'PHY-001' })
  @IsString()
  @IsNotEmpty()
  physicianId: string;

  @ApiProperty({ example: 'Cardiology Consultation' })
  @IsString()
  @IsNotEmpty()
  appointmentType: string;

  @ApiProperty({ enum: ClinicalPriority, example: ClinicalPriority.RED_STAR })
  @IsEnum(ClinicalPriority)
  priority: ClinicalPriority;

  @ApiProperty({ example: 7, description: 'Maximum clinical delay allowable in days' })
  @IsOptional()
  targetWaitDays?: number;

  @ApiProperty({ example: 'Urgent referral post triage', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

