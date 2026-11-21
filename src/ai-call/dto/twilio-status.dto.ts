import { IsString, IsOptional } from 'class-validator';

export class TwilioStatusDto {
  @IsString()
  @IsOptional()
  CallSid?: string;

  @IsString()
  @IsOptional()
  CallStatus?: string;

  @IsString()
  @IsOptional()
  CallDuration?: string;

  @IsString()
  @IsOptional()
  From?: string;

  @IsString()
  @IsOptional()
  To?: string;

  @IsString()
  @IsOptional()
  Direction?: string;
}
