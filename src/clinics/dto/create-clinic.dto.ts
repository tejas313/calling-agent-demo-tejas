import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClinicDto {
  @ApiProperty({ example: 'CLINIC-003' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Downtown Health Center' })
  @IsString()
  name: string;

  @ApiProperty({ example: '789 Bay Street, Toronto, ON', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: '(416) 555-0300', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', required: false })
  @IsOptional()
  @IsString()
  twilioAccountSid?: string;

  @ApiProperty({ example: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', required: false })
  @IsOptional()
  @IsString()
  twilioAuthToken?: string;

  @ApiProperty({ example: '+18254511690', required: false })
  @IsOptional()
  @IsString()
  twilioPhoneNumber?: string;
}

