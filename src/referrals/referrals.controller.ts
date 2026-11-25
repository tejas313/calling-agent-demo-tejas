import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { ExtractReferralDto } from './dto/extract-referral.dto';
import { ReviewReferralDto } from './dto/review-referral.dto';

@ApiTags('Referrals & Triage')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post('extract')
  @ApiOperation({
    summary: 'AI Extraction & Triage of Referral Document',
    description:
      'Extracts patient, referring doctor, clinical priority, and performs AI workload distribution.',
  })
  async extractAndCreate(@Body() dto: ExtractReferralDto) {
    return this.referralsService.extractAndCreate(dto);
  }

  @Get('pending-review')
  @ApiOperation({ summary: 'Get all referrals awaiting physician review' })
  async getPendingReview() {
    return this.referralsService.getPendingReview();
  }

  @Get()
  @ApiOperation({ summary: 'List all referrals' })
  async findAll() {
    return this.referralsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get referral by ID' })
  async findById(@Param('id') id: string) {
    return this.referralsService.findById(id);
  }

  @Post(':id/review')
  @ApiOperation({
    summary: 'Physician Review & Clinical Priority Approval',
    description: 'Allows physician to approve or adjust priority, delay, notes, or physician assignment.',
  })
  async reviewReferral(@Param('id') id: string, @Body() dto: ReviewReferralDto) {
    return this.referralsService.reviewReferral(id, dto);
  }
}

