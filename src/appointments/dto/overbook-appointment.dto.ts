import { IsString, IsNotEmpty, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OverbookAppointmentDto {
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

  @ApiProperty({ example: '2026-10-16' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: '10:00', description: 'Overbooked time slot' })
  @IsString()
  @IsNotEmpty()
  time: string;

  @ApiProperty({ example: 'Urgent Assessment' })
  @IsString()
  @IsNotEmpty()
  appointmentType: string;

  @ApiProperty({
    example: 'PHY-001',
    description: 'Physician ID who authorized the overbooking',
  })
  @IsString()
  @IsNotEmpty()
  overbookingApprovedBy: string;

  @ApiProperty({ example: 'Urgent post-op complication, physician approved squeeze-in', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

