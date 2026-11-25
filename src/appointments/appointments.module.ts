import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './entities/appointment.entity';
import { AiCall } from '../ai-call/entities/ai-call.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentAutomationService } from './appointment-automation.service';
import { AppointmentsController } from './appointments.controller';
import { PatientsModule } from '../patients/patients.module';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, AiCall]),
    PatientsModule,
    forwardRef(() => WaitlistModule),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentAutomationService],
  exports: [AppointmentsService, AppointmentAutomationService],
})
export class AppointmentsModule {}
