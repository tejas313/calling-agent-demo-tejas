import { Module } from '@nestjs/common';
import { AgentService } from './agent/agent.service';
import { PatientsModule } from '../patients/patients.module';
import { LangsmithModule } from '../langsmith/langsmith.module';

@Module({
  imports: [
    PatientsModule,
    LangsmithModule,
  ],
  providers: [AgentService],
  exports: [AgentService],
})
export class LangchainModule {}
