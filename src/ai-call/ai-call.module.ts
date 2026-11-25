import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiCall,
  PatientAppointmentBooking,
  PatientProfile,
  PhysicianClinicProfile,
  PhysicianPatientSlot,
  TriageAssignment,
} from '../entities';
import { AiCallController } from './ai-call.controller';
import { AiCallService } from './ai-call.service';
import { TwilioModule } from '../twilio/twilio.module';
import { LangchainModule } from '../langchain/langchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiCall,
      PatientProfile,
      TriageAssignment,
      PhysicianClinicProfile,
      PhysicianPatientSlot,
      PatientAppointmentBooking,
    ]),
    TwilioModule,
    LangchainModule,
  ],
  controllers: [AiCallController],
  providers: [AiCallService],
  exports: [AiCallService],
})
export class AiCallModule {}
