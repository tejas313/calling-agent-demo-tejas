import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtractReferralDto {
  @ApiProperty({
    description: 'Raw referral text or extracted OCR document text',
    example:
      'Referral from Dr. David Henderson (Billing: #48291, Phone: 416-555-8812). Patient: Emily Davis, DOB: 1985-06-14, Phone: +14165559876. Reason: Severe acute chest palpitations and shortness of breath with exertion onset 3 days ago. Requires urgent Cardiology evaluation.',
  })
  @IsString()
  @IsNotEmpty()
  documentText: string;

  @ApiProperty({ example: 'CLINIC-001', required: false })
  @IsOptional()
  @IsString()
  clinicId?: string;
}

