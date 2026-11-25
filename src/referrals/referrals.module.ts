import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from './entities/referral.entity';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { ReferralExtractionService } from './referral-extraction.service';
import { ReferralDistributionService } from './referral-distribution.service';
import { PhysiciansModule } from '../physicians/physicians.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Referral]),
    PhysiciansModule,
    PatientsModule,
  ],
  controllers: [ReferralsController],
  providers: [
    ReferralsService,
    ReferralExtractionService,
    ReferralDistributionService,
  ],
  exports: [ReferralsService, ReferralExtractionService, ReferralDistributionService],
})
export class ReferralsModule {}

