import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './entities/appointment.entity';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all appointments' })
  @ApiResponse({ status: 200, description: 'Return all appointments.' })
  async findAll(): Promise<Appointment[]> {
    return this.appointmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiResponse({ status: 200, description: 'Return the appointment.' })
  @ApiResponse({ status: 404, description: 'Appointment not found.' })
  async findById(@Param('id') id: string): Promise<Appointment> {
    return this.appointmentsService.findById(id);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get appointments for a patient' })
  @ApiResponse({ status: 200, description: 'Return appointments for the specified patient.' })
  async findByPatient(@Param('patientId') patientId: string): Promise<Appointment[]> {
    return this.appointmentsService.findByPatient(patientId);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirm an appointment' })
  @ApiResponse({ status: 200, description: 'Appointment confirmed.' })
  async confirm(@Param('id') id: string): Promise<Appointment> {
    return this.appointmentsService.confirm(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel an appointment' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled.' })
  async cancel(@Param('id') id: string, @Body() body: { reason?: string }): Promise<Appointment> {
    return this.appointmentsService.cancel(id, body.reason);
  }

  @Get(':id/available-slots')
  @ApiOperation({ summary: 'Get available slots for a physician on a date' })
  @ApiResponse({ status: 200, description: 'Return available slots.' })
  async getAvailableSlots(
    @Param('id') id: string,
    @Query('physicianId') physicianId: string,
    @Query('date') date: string,
  ): Promise<string[]> {
    return this.appointmentsService.getAvailableSlots(physicianId, date);
  }
}
