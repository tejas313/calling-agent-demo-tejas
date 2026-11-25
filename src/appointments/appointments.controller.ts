import { Controller, Get, Post, Body, Param, Query, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { AppointmentAutomationService } from './appointment-automation.service';
import { SchedulePriorityAppointmentDto } from './dto/schedule-priority-appointment.dto';
import { OverbookAppointmentDto } from './dto/overbook-appointment.dto';

@ApiTags('Appointments & Scheduling')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly automationService: AppointmentAutomationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all appointments' })
  async findAll() {
    return this.appointmentsService.findAll();
  }

  @Get('slots')
  @ApiOperation({ summary: 'Get available time slots for physician on date' })
  async getAvailableSlots(
    @Query('physicianId') physicianId: string,
    @Query('date') date: string,
  ) {
    return this.appointmentsService.getAvailableSlots(physicianId, date);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  async findById(@Param('id') id: string) {
    return this.appointmentsService.findById(id);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get appointments for a patient' })
  async findByPatient(@Param('patientId') patientId: string) {
    return this.appointmentsService.findByPatient(patientId);
  }

  @Post('priority')
  @ApiOperation({
    summary: 'Automated Priority Scheduling based on Physician Priority & Delay',
  })
  async schedulePriority(@Body() dto: SchedulePriorityAppointmentDto) {
    return this.appointmentsService.createPriorityAppointment(dto);
  }

  @Post('overbook')
  @ApiOperation({
    summary: 'Physician-Approved Overbooking',
    description: 'Schedules an urgent appointment with physician approval even if standard slots are full.',
  })
  async overbook(@Body() dto: OverbookAppointmentDto) {
    return this.appointmentsService.overbookAppointment(dto);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirm an appointment' })
  async confirm(@Param('id') id: string) {
    return this.appointmentsService.confirm(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel an appointment and trigger waitlist backfill (Scenario 9/10)' })
  async cancel(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.appointmentsService.cancel(id, reason);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule an appointment (Scenario 8)' })
  async reschedule(
    @Param('id') id: string,
    @Body('date') date: string,
    @Body('time') time: string,
  ) {
    return this.appointmentsService.reschedule(id, date, time);
  }

  @Post('clinic-cancellation')
  @ApiOperation({
    summary: 'Physician Cancels Clinic Schedule (Scenario 27)',
    description: 'Identifies all affected patients in priority order and initiates priority reschedule.',
  })
  async cancelClinic(
    @Body('physicianId') physicianId: string,
    @Body('date') date: string,
    @Body('reason') reason?: string,
  ) {
    return this.appointmentsService.cancelClinicSchedule(physicianId, date, reason);
  }

  @Post('physician-late')
  @ApiOperation({
    summary: 'Physician Running Late Notification (Scenario 28)',
    description: 'Proactively contacts upcoming patients with delay minutes and reschedule options.',
  })
  async physicianLate(
    @Body('physicianId') physicianId: string,
    @Body('date') date: string,
    @Body('delayMinutes') delayMinutes: number,
  ) {
    return this.appointmentsService.notifyPhysicianRunningLate(physicianId, date, delayMinutes);
  }

  @Post('automation/run-72hr-followups')
  @ApiOperation({ summary: 'Run 72-Hour Follow-up Automation Check (Scenario 3, 6, 7)' })
  async run72HourFollowUps() {
    return this.automationService.run72HourFollowUpScan();
  }

  @Post('automation/run-reminders')
  @ApiOperation({ summary: 'Run 7-Day & 48-72h Automated Reminders Check (Scenario 21)' })
  async runReminders() {
    return this.automationService.runAutomatedRemindersScan();
  }
}
