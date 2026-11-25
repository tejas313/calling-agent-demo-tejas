import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCall } from './entities/ai-call.entity';
import { AiCallController } from './ai-call.controller';
import { AiCallService } from './ai-call.service';
import { TwilioModule } from '../twilio/twilio.module';
import { LangchainModule } from '../langchain/langchain.module';
import { PatientsModule } from '../patients/patients.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiCall]),
    TwilioModule,
    LangchainModule,
    PatientsModule,
    forwardRef(() => AppointmentsModule),
    ClinicsModule,
    WaitlistModule,
  ],
  controllers: [AiCallController],
  providers: [AiCallService],
  exports: [AiCallService],
})
export class AiCallModule {}
