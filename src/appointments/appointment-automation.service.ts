import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import dayjs from 'dayjs';
import { Appointment } from './entities/appointment.entity';
import { AiCall } from '../ai-call/entities/ai-call.entity';
import { PatientsService } from '../patients/patients.service';
import {
  AppointmentStatus,
  CallStatus,
  CallOutcome,
  CommunicationMethod,
} from '../common/constants';

@Injectable()
export class AppointmentAutomationService {
  private readonly logger = new Logger(AppointmentAutomationService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
    @InjectRepository(AiCall)
    private readonly aiCallRepository: Repository<AiCall>,
    private readonly patientsService: PatientsService,
  ) {}

  /**
   * Scenario 3, 6, 7:
   * 72-Hour Follow-up Automation:
   * - Call Attempt 1 unanswered -> Awaiting Response
   * - 72 hours no response -> Initiates Call Attempt 2
   * - 72 hours after Attempt 2 with no response -> Marks Unable to Reach, documents chart
   */
  async run72HourFollowUpScan(): Promise<{
    attempt2Initiated: string[];
    markedUnreachable: string[];
  }> {
    this.logger.log('Running 72-hour follow-up automation scan...');
    const threshold72HoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const threshold144HoursAgo = new Date(Date.now() - 144 * 60 * 60 * 1000);

    const attempt2Initiated: string[] = [];
    const markedUnreachable: string[] = [];

    // 1. Find calls that were unanswered/voicemail >72 hours ago on Attempt 1
    const pendingAttempt1 = await this.aiCallRepository.find({
      where: {
        status: CallStatus.AWAITING_RESPONSE,
        startedAt: LessThan(threshold72HoursAgo),
      },
    });

    for (const call of pendingAttempt1) {
      call.status = CallStatus.CONTACT_ATTEMPT_2;
      await this.aiCallRepository.save(call);
      attempt2Initiated.push(call.id);

      await this.patientsService.logCommunication({
        patientId: call.patientId,
        communicationMethod: CommunicationMethod.PHONE,
        verified: false,
        interactionReason: '72-Hour Follow-up: Second Contact Attempt',
        aiActions: 'No response after 72 hours. Second contact attempt initiated (call + SMS sent).',
        finalAction: 'Second Contact Attempt',
        finalWorkflowStatus: 'Contact Attempt 2',
      });
      this.logger.log(`[Scenario 6] Second contact attempt initiated for call ${call.id}, patient ${call.patientId}`);
    }

    // 2. Find calls that received no response after Attempt 2 (>72h after attempt 2)
    const pendingAttempt2 = await this.aiCallRepository.find({
      where: {
        status: CallStatus.CONTACT_ATTEMPT_2,
        startedAt: LessThan(threshold144HoursAgo),
      },
    });

    for (const call of pendingAttempt2) {
      call.status = CallStatus.UNABLE_TO_REACH;
      call.outcome = CallOutcome.UNREACHABLE;
      await this.aiCallRepository.save(call);
      markedUnreachable.push(call.id);

      await this.patientsService.logCommunication({
        patientId: call.patientId,
        communicationMethod: CommunicationMethod.PHONE,
        verified: false,
        interactionReason: 'Patient Unreachable After 2 Attempts',
        aiActions: 'No response after second contact attempt. Patient marked unreachable according to clinic rules.',
        finalAction: 'Marked Unable to Reach',
        finalWorkflowStatus: 'Unable to Reach Patient',
      });
      this.logger.log(`[Scenario 7] Marked patient ${call.patientId} unreachable for call ${call.id}`);
    }

    return { attempt2Initiated, markedUnreachable };
  }

  /**
   * Scenario 21: Automated appointment confirmation and reminder scan:
   * - 7 days before appointment: send SMS reminder
   * - 48-72 hours before appointment: AI requests confirmation
   */
  async runAutomatedRemindersScan(): Promise<{
    sevenDayRemindersSent: number;
    seventyTwoHourRequestsSent: number;
  }> {
    this.logger.log('Running automated appointment reminders and confirmation scan...');
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    const sevenDaysOut = formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const threeDaysOut = formatDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    const twoDaysOut = formatDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));

    // 7-day reminders
    const appts7Days = await this.appointmentRepository.find({
      where: {
        date: new Date(sevenDaysOut),
        reminderSent7Days: false,
        status: AppointmentStatus.PENDING,
      },
    });

    for (const appt of appts7Days) {
      appt.reminderSent7Days = true;
      await this.appointmentRepository.save(appt);

      await this.patientsService.logCommunication({
        patientId: appt.patientId,
        communicationMethod: CommunicationMethod.SMS,
        verified: true,
        interactionReason: '7-Day Appointment Reminder',
        aiActions: `Automated SMS reminder sent for upcoming appointment on ${appt.date} at ${appt.time}.`,
        finalAction: 'Reminder Sent',
        finalWorkflowStatus: 'Pending Confirmation',
      });
    }

    // 48-72h confirmation requests
    const appts72Hours = await this.appointmentRepository
      .createQueryBuilder('a')
      .where('a.date BETWEEN :d2 AND :d3', { d2: twoDaysOut, d3: threeDaysOut })
      .andWhere('a.reminder_sent_72hours = false')
      .andWhere('a.status = :status', { status: AppointmentStatus.PENDING })
      .getMany();

    for (const appt of appts72Hours) {
      appt.reminderSent72Hours = true;
      await this.appointmentRepository.save(appt);

      await this.patientsService.logCommunication({
        patientId: appt.patientId,
        communicationMethod: CommunicationMethod.PHONE,
        verified: true,
        interactionReason: '48-72 Hour Appointment Confirmation Request',
        aiActions: `Initiating confirmation request for appointment on ${appt.date} at ${appt.time}.`,
        finalAction: 'Confirmation Requested',
        finalWorkflowStatus: 'Awaiting Confirmation',
      });
    }

    return {
      sevenDayRemindersSent: appts7Days.length,
      seventyTwoHourRequestsSent: appts72Hours.length,
    };
  }
}

