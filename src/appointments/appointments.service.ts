import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import dayjs from 'dayjs';
import { Appointment } from './entities/appointment.entity';
import { AppointmentStatus, ClinicalPriority, CommunicationMethod } from '../common/constants';
import { SchedulePriorityAppointmentDto } from './dto/schedule-priority-appointment.dto';
import { OverbookAppointmentDto } from './dto/overbook-appointment.dto';
import { PatientsService } from '../patients/patients.service';
import { WaitlistService } from '../waitlist/waitlist.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
    @Optional()
    private readonly patientsService?: PatientsService,
    @Optional()
    @Inject(forwardRef(() => WaitlistService))
    private readonly waitlistService?: WaitlistService,
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

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      this.logger.log(`Appointment ${appointmentId} is already confirmed.`);
      return appointment;
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Cannot confirm a cancelled appointment');
    }

    appointment.status = AppointmentStatus.CONFIRMED;
    const saved = await this.appointmentRepository.save(appointment);

    await this.patientsService?.logCommunication({
      patientId: appointment.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: true,
      interactionReason: 'Appointment Confirmation',
      aiActions: `Confirmed appointment on ${appointment.date} at ${appointment.time}.`,
      finalAction: 'Appointment Confirmed',
      finalWorkflowStatus: 'Appointment Confirmed',
    });

    return saved;
  }

  async cancel(appointmentId: string, reason?: string): Promise<Appointment> {
    const appointment = await this.findById(appointmentId);

    if (appointment.status === AppointmentStatus.CANCELLED) {
      return appointment;
    }

    appointment.status = AppointmentStatus.CANCELLED;
    if (reason) {
      appointment.cancelReason = reason;
    }

    const saved = await this.appointmentRepository.save(appointment);

    await this.patientsService?.logCommunication({
      patientId: appointment.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: true,
      interactionReason: 'Appointment Cancellation',
      patientResponse: reason || 'Patient cancelled',
      aiActions: `Cancelled appointment on ${appointment.date} at ${appointment.time}. Cancellation reason: ${reason || 'N/A'}.`,
      finalAction: 'Appointment Cancelled',
      finalWorkflowStatus: 'Appointment Cancelled',
    });

    // Trigger waitlist backfill (Scenario 10)
    try {
      if (this.waitlistService) {
        const nextWaitlistPatient = await this.waitlistService.findNextEligiblePatient(
          appointment.clinicId,
          appointment.physicianId,
        );
        if (nextWaitlistPatient) {
          this.logger.log(
            `[Scenario 10 - Waitlist Trigger] Found eligible waitlist candidate ${nextWaitlistPatient.patientId} for cancelled slot`,
          );
          await this.waitlistService.placeTemporaryHold(nextWaitlistPatient.id, 15);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Waitlist check notice: ${err?.message}`);
    }

    return saved;
  }

  async reschedule(appointmentId: string, newDate: string, newTime: string): Promise<Appointment> {
    const appointment = await this.findById(appointmentId);

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Cannot reschedule a cancelled appointment');
    }

    const oldDate = appointment.date;
    const oldTime = appointment.time;

    appointment.date = new Date(newDate);
    appointment.time = newTime;
    appointment.status = AppointmentStatus.RESCHEDULED;

    const saved = await this.appointmentRepository.save(appointment);

    await this.patientsService?.logCommunication({
      patientId: appointment.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: true,
      interactionReason: 'Appointment Rescheduled',
      aiActions: `Moved appointment from ${oldDate} ${oldTime} to ${newDate} at ${newTime}.`,
      finalAction: 'Appointment Rescheduled',
      finalWorkflowStatus: 'Appointment Rescheduled',
    });

    return saved;
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

    const takenSlots = existingAppointments
      .filter((a) => a.status !== AppointmentStatus.CANCELLED)
      .map((a) => a.time);

    let availableSlots = allSlots.filter((slot) => !takenSlots.includes(slot));

    if (availableSlots.length < 3) {
      availableSlots = allSlots.slice(0, 3);
    }

    return availableSlots;
  }

  /**
   * Automates appointment scheduling based on physician priority, availability, and allowable delay.
   */
  async createPriorityAppointment(dto: SchedulePriorityAppointmentDto): Promise<Appointment> {
    const maxDays = dto.targetWaitDays || (dto.priority === ClinicalPriority.RED_STAR ? 2 : 14);

    // Find the earliest available slot within max allowable clinical delay
    let selectedDate = dayjs().add(1, 'day');
    let selectedSlot = '09:00';

    for (let i = 1; i <= maxDays; i++) {
      const checkDate = dayjs().add(i, 'day');
      // Skip weekends for routine, but allow weekdays
      if (checkDate.day() === 0 || checkDate.day() === 6) continue;

      const dateStr = checkDate.format('YYYY-MM-DD');
      const slots = await this.getAvailableSlots(dto.physicianId, dateStr);
      if (slots.length > 0) {
        selectedDate = checkDate;
        selectedSlot = slots[0];
        break;
      }
    }

    const appointment = this.appointmentRepository.create({
      id: `APT-${Date.now().toString().slice(-6)}`,
      patientId: dto.patientId,
      clinicId: dto.clinicId,
      physicianId: dto.physicianId,
      date: selectedDate.toDate(),
      time: selectedSlot,
      appointmentType: dto.appointmentType,
      priority: dto.priority,
      status: AppointmentStatus.PENDING,
      notes: dto.notes,
    });

    const saved = await this.appointmentRepository.save(appointment);

    await this.patientsService?.logCommunication({
      patientId: dto.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: true,
      interactionReason: 'Automated Priority Scheduling',
      aiActions: `Automated schedule: Assigned to ${dto.physicianId} on ${selectedDate.format('YYYY-MM-DD')} at ${selectedSlot} with priority ${dto.priority}.`,
      appointmentOffered: `${selectedDate.format('YYYY-MM-DD')} ${selectedSlot}`,
      finalAction: 'Appointment Offered',
      finalWorkflowStatus: 'Awaiting Confirmation',
    });

    return saved;
  }

  /**
   * Physician-Approved Overbooking:
   * Squeezes an urgent patient into an existing schedule with physician authorization.
   */
  async overbookAppointment(dto: OverbookAppointmentDto): Promise<Appointment> {
    this.logger.log(
      `[Overbooking] Booking overbook appointment for patient ${dto.patientId} with physician ${dto.physicianId}, approved by ${dto.overbookingApprovedBy}`,
    );

    const appointment = this.appointmentRepository.create({
      id: `APT-OB-${Date.now().toString().slice(-5)}`,
      patientId: dto.patientId,
      clinicId: dto.clinicId,
      physicianId: dto.physicianId,
      date: new Date(dto.date),
      time: dto.time,
      appointmentType: dto.appointmentType,
      priority: ClinicalPriority.URGENT,
      isOverbooked: true,
      overbookingApprovedBy: dto.overbookingApprovedBy,
      status: AppointmentStatus.CONFIRMED,
      notes: `${dto.notes || ''} [Physician-Approved Overbooking by ${dto.overbookingApprovedBy}]`.trim(),
    });

    const saved = await this.appointmentRepository.save(appointment);

    await this.patientsService?.logCommunication({
      patientId: dto.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: true,
      interactionReason: 'Physician-Approved Overbooking',
      aiActions: `Overbooked urgent slot on ${dto.date} at ${dto.time}. Authorized by physician ${dto.overbookingApprovedBy}.`,
      finalAction: 'Overbooked Slot Confirmed',
      finalWorkflowStatus: 'Appointment Confirmed',
    });

    return saved;
  }

  /**
   * Scenario 27: Physician Cancels a Clinic.
   * Identifies all affected patients, sorts in priority order, initiates rescheduling.
   */
  async cancelClinicSchedule(
    physicianId: string,
    date: string,
    reason?: string,
  ): Promise<{ affectedAppointments: Appointment[]; message: string }> {
    const affected = await this.appointmentRepository.find({
      where: {
        physicianId,
        date: new Date(date),
      } as any,
    });

    // Sort by priority (Red Star / Urgent first)
    affected.sort((a, b) => {
      const pMap: Record<string, number> = {
        [ClinicalPriority.RED_STAR]: 1,
        [ClinicalPriority.URGENT]: 2,
        [ClinicalPriority.BLUE_STAR]: 3,
        [ClinicalPriority.SEMI_URGENT]: 4,
        [ClinicalPriority.ROUTINE]: 5,
      };
      return (pMap[a.priority] || 5) - (pMap[b.priority] || 5);
    });

    for (const appt of affected) {
      appt.status = AppointmentStatus.RESCHEDULED;
      appt.notes = `${appt.notes || ''} [Physician cancelled clinic on ${date}: ${reason || 'Physician unavailable'}]`.trim();
      await this.appointmentRepository.save(appt);

      await this.patientsService?.logCommunication({
        patientId: appt.patientId,
        communicationMethod: CommunicationMethod.PHONE,
        verified: true,
        interactionReason: 'Clinic Cancellation Reschedule',
        aiActions: `Physician unavailable on ${date}. Patient prioritized for urgent rescheduling.`,
        finalAction: 'Clinic Cancelled - Priority Reschedule Initiated',
        finalWorkflowStatus: 'Awaiting Reschedule',
      });
    }

    return {
      affectedAppointments: affected,
      message: `Identified and prioritized ${affected.length} affected patients for rescheduling.`,
    };
  }

  /**
   * Scenario 28: Physician is running late.
   * Proactively contacts upcoming patients with delay notice and options.
   */
  async notifyPhysicianRunningLate(
    physicianId: string,
    date: string,
    delayMinutes: number,
  ): Promise<{ notifiedCount: number; message: string }> {
    const upcoming = await this.appointmentRepository.find({
      where: {
        physicianId,
        date: new Date(date),
        status: AppointmentStatus.CONFIRMED,
      } as any,
    });

    for (const appt of upcoming) {
      await this.patientsService?.logCommunication({
        patientId: appt.patientId,
        communicationMethod: CommunicationMethod.SMS,
        verified: true,
        interactionReason: 'Physician Running Late Notification',
        aiActions: `Dr. is approximately ${delayMinutes} minutes behind schedule. Offered option to keep appointment or reschedule.`,
        finalAction: 'Late Notice Sent',
        finalWorkflowStatus: 'Delay Notice Sent',
      });
    }

    return {
      notifiedCount: upcoming.length,
      message: `Proactively notified ${upcoming.length} patients of ${delayMinutes} minute delay with reschedule options.`,
    };
  }

  async markCallLater(appointmentId: string, callbackTime: string): Promise<Appointment> {
    const appointment = await this.findById(appointmentId);
    appointment.callbackTime = callbackTime;
    return this.appointmentRepository.save(appointment);
  }
}
