import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallType } from '../../common/constants';

export class StartCallDto {
  @ApiProperty({ example: '+18735060917', description: 'Patient phone number in E.164 format' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'uuid-patient-id', description: 'Patient profile ID (patient_profiles.id)' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'uuid-clinic-id', description: 'Clinic ID (clinics.id)' })
  @IsString()
  @IsNotEmpty()
  clinicId: string;

  @ApiProperty({ example: 'uuid-assignment-id', description: 'Triage assignment ID (triage_assignments.id)' })
  @IsString()
  @IsNotEmpty()
  assignmentsId: string;

  @ApiPropertyOptional({
    example: 'uuid-physician-profile-id',
    description: 'Assigned physician profile ID (physician_clinic_profiles.id). Falls back to triage_assignments.assigned_physician_id if omitted.',
  })
  @IsOptional()
  @IsString()
  assigned_physician_id?: string;

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
    description: 'Test mode: skips the real Twilio call. The AI webhook can still be triggered manually via POST /ai-call/twilio/voice?callId=<id>',
  })
  @IsOptional()
  @IsBoolean()
  testMode?: boolean;
}
