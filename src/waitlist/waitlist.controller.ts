import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { AddToWaitlistDto } from './dto/add-to-waitlist.dto';

@ApiTags('Waitlist & Star Tracking')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @ApiOperation({ summary: 'Add patient to waitlist with Red/Blue star priority' })
  async addToWaitlist(@Body() dto: AddToWaitlistDto) {
    return this.waitlistService.addToWaitlist(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get prioritized waitlist (Red Star > Blue Star > Standard)' })
  async getWaitlist(
    @Query('clinicId') clinicId?: string,
    @Query('physicianId') physicianId?: string,
  ) {
    return this.waitlistService.getWaitlist(clinicId, physicianId);
  }

  @Post(':id/hold')
  @ApiOperation({ summary: 'Place temporary hold on appointment slot for waitlist candidate (Scenario 11)' })
  async placeTemporaryHold(
    @Param('id') id: string,
    @Query('minutes') minutes?: number,
  ) {
    return this.waitlistService.placeTemporaryHold(id, minutes ? Number(minutes) : 15);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Patient accepts earlier appointment offer' })
  async acceptOffer(@Param('id') id: string) {
    return this.waitlistService.acceptOffer(id);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Patient declines earlier appointment offer - triggers next patient' })
  async declineOffer(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.waitlistService.declineOffer(id, reason);
  }

  @Post('process-expired-holds')
  @ApiOperation({ summary: 'Process expired temporary holds' })
  async processExpiredHolds() {
    return this.waitlistService.processExpiredHolds();
  }
}

