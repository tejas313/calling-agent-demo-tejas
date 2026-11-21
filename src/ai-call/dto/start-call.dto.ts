import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallType } from '../../common/constants';

export class StartCallDto {
  @ApiProperty({ example: '+14165551234', description: 'Patient phone number in E.164 format' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'PAT-001', description: 'Patient ID' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'CLINIC-001', description: 'Clinic ID' })
  @IsString()
  @IsNotEmpty()
  clinicId: string;

  @ApiProperty({ example: 'APT-001', description: 'Appointment ID' })
  @IsString()
  @IsNotEmpty()
  appointmentId: string;

  @ApiPropertyOptional({ example: 'en', description: 'Language code', enum: ['en', 'fr'] })
  @IsOptional()
  @IsString()
  language?: string = 'en';

  @ApiPropertyOptional({ example: 'appointment_confirmation', enum: CallType })
  @IsOptional()
  @IsEnum(CallType)
  callType?: CallType = CallType.APPOINTMENT_CONFIRMATION;

  @ApiPropertyOptional({
    example: false,
    description: 'Test mode: skips the real Twilio call. Use when Twilio number is not yet verified. The AI webhook can still be triggered manually via POST /ai-call/twilio/voice?callId=<id>',
  })
  @IsOptional()
  @IsBoolean()
  testMode?: boolean;
}
