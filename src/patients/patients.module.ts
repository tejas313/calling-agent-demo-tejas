import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientProfile } from '../entities';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { ResponseService } from '../common/response.service';

@Module({
  imports: [TypeOrmModule.forFeature([PatientProfile])],
  controllers: [PatientsController],
  providers: [PatientsService, ResponseService],
  exports: [PatientsService],
})
export class PatientsModule {}
