import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './entities/appointment.entity';
import { AppointmentStatus } from '../common/constants';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
  ) {}

  async findAll(): Promise<Appointment[]> {
    return this.appointmentRepository.find();
  }

  async findById(id: string): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({ where: { id } as any });
    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }
    return appointment;
  }

  async findByPatient(patientId: string): Promise<Appointment[]> {
    return this.appointmentRepository.find({ where: { patientId } as any });
  }

  async confirm(appointmentId: string): Promise<Appointment> {
    const appointment = await this.findById(appointmentId);

    if ((appointment as any).status === AppointmentStatus.CONFIRMED) {
      this.logger.log(`Appointment ${appointmentId} is already confirmed.`);
      return appointment;
    }

    if ((appointment as any).status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Cannot confirm a cancelled appointment');
    }

    (appointment as any).status = AppointmentStatus.CONFIRMED;
    return this.appointmentRepository.save(appointment);
  }

  async cancel(appointmentId: string, reason?: string): Promise<Appointment> {
    const appointment = await this.findById(appointmentId);

    if ((appointment as any).status === AppointmentStatus.CANCELLED) {
      return appointment;
    }

    (appointment as any).status = AppointmentStatus.CANCELLED;
    if (reason) {
      (appointment as any).cancelReason = reason;
    }

    return this.appointmentRepository.save(appointment);
  }

  async reschedule(appointmentId: string, newDate: string, newTime: string): Promise<Appointment> {
    const appointment = await this.findById(appointmentId);

    if ((appointment as any).status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Cannot reschedule a cancelled appointment');
    }

    (appointment as any).date = new Date(newDate);
    (appointment as any).time = newTime;
    (appointment as any).status = AppointmentStatus.RESCHEDULED;

    return this.appointmentRepository.save(appointment);
  }

  async getAvailableSlots(physicianId: string, date: string): Promise<string[]> {
    const allSlots = [
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
    ];

    const existingAppointments = await this.appointmentRepository.find({
      where: { physicianId, date: new Date(date) } as any,
    });

    const takenSlots = existingAppointments.map((a) => (a as any).time);
    let availableSlots = allSlots.filter((slot) => !takenSlots.includes(slot));

    // For demo purposes: ensure minimum 3 slots
    if (availableSlots.length < 3) {
      availableSlots = allSlots.slice(0, 3);
    }

    return availableSlots;
  }

  async markCallLater(appointmentId: string, callbackTime: string): Promise<Appointment> {
    const appointment = await this.findById(appointmentId);
    (appointment as any).callbackTime = callbackTime;
    return this.appointmentRepository.save(appointment);
  }
}
