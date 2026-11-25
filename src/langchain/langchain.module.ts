import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Clinic,
  PhysicianClinicProfile,
  PhysicianPatientSlot,
  TriageAssignment,
} from '../entities';
import { AgentService } from './agent/agent.service';
import { PatientsModule } from '../patients/patients.module';
import { LangsmithModule } from '../langsmith/langsmith.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PhysicianPatientSlot,
      TriageAssignment,
      Clinic,
      PhysicianClinicProfile,
    ]),
    PatientsModule,
    LangsmithModule,
  ],
  providers: [AgentService],
  exports: [AgentService],
})
export class LangchainModule {}
