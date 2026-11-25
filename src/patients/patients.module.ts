import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './entities/patient.entity';
import { CommunicationLog } from './entities/communication-log.entity';
import { PatientsService } from './patients.service';
import { CommunicationLogService } from './communication-log.service';
import { PatientsController } from './patients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Patient, CommunicationLog])],
  controllers: [PatientsController],
  providers: [PatientsService, CommunicationLogService],
  exports: [PatientsService, CommunicationLogService],
})
export class PatientsModule {}
