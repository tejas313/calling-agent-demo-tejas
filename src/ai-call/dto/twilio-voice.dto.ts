import { IsString, IsOptional } from 'class-validator';

export class TwilioVoiceDto {
  @IsString()
  @IsOptional()
  CallSid?: string;

  @IsString()
  @IsOptional()
  From?: string;

  @IsString()
  @IsOptional()
  To?: string;

  @IsString()
  @IsOptional()
  CallStatus?: string;

  @IsString()
  @IsOptional()
  SpeechResult?: string;

  @IsString()
  @IsOptional()
  Confidence?: string;

  @IsString()
  @IsOptional()
  Digits?: string;
}
