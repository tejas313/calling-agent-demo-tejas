import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallType } from '../../common/constants';

export class StartCallByPhoneDto {
  @ApiProperty({ example: '+18735060917', description: 'Patient phone number in E.164 format' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

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
