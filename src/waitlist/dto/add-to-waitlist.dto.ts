import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ClinicalPriority, StarRating } from '../../common/constants';

export class AddToWaitlistDto {
  @ApiProperty({ example: 'PAT-001' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'CLINIC-001' })
  @IsString()
  @IsNotEmpty()
  clinicId: string;

  @ApiProperty({ example: 'Annual Physical' })
  @IsString()
  @IsNotEmpty()
  appointmentType: string;

  @ApiProperty({ example: 'PHY-001', required: false })
  @IsOptional()
  @IsString()
  physicianId?: string;

  @ApiProperty({ enum: ClinicalPriority, example: ClinicalPriority.RED_STAR, required: false })
  @IsOptional()
  @IsEnum(ClinicalPriority)
  priority?: ClinicalPriority;

  @ApiProperty({ enum: StarRating, example: StarRating.RED_STAR, required: false })
  @IsOptional()
  @IsEnum(StarRating)
  starRating?: StarRating;

  @ApiProperty({ example: '2026-10-25', required: false })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiProperty({ example: 'APT-001', required: false })
  @IsOptional()
  @IsString()
  currentAppointmentId?: string;

  @ApiProperty({ example: 'Patient requests earlier morning slot if cancellation occurs', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

