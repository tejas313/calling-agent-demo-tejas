import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { ResponseService } from '../common/response.service';

@Module({
  controllers: [PatientsController],
  providers: [PatientsService, ResponseService],
  exports: [PatientsService],
})
export class PatientsModule {}
