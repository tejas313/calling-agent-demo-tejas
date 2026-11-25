import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePhysicianDto {
  @ApiProperty({ example: 'PHY-004' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Dr. Emily Watson' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Cardiology' })
  @IsString()
  specialty: string;

  @ApiProperty({ example: 'CLINIC-001' })
  @IsString()
  clinicId: string;

  @ApiProperty({ example: 20, required: false })
  @IsOptional()
  @IsNumber()
  maxDailyAppointments?: number;
}

