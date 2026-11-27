import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiCall,
  AiCallLog,
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
import { ResponseService } from '../common/response.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiCall,
      AiCallLog,
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
  providers: [AiCallService, ResponseService],
  exports: [AiCallService],
})
export class AiCallModule {}
