import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { AddToWaitlistDto } from './dto/add-to-waitlist.dto';
import { PatientsService } from '../patients/patients.service';
import {
  WaitlistStatus,
  StarRating,
  ClinicalPriority,
  CommunicationMethod,
} from '../common/constants';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly waitlistRepository: Repository<WaitlistEntry>,
    private readonly patientsService: PatientsService,
  ) {}

  async addToWaitlist(dto: AddToWaitlistDto): Promise<WaitlistEntry> {
    const starRating =
      dto.starRating ||
      (dto.priority === ClinicalPriority.RED_STAR
        ? StarRating.RED_STAR
        : dto.priority === ClinicalPriority.BLUE_STAR
          ? StarRating.BLUE_STAR
          : StarRating.STANDARD);

    const entry = this.waitlistRepository.create({
      ...dto,
      starRating,
      priority: dto.priority || ClinicalPriority.ROUTINE,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      status: WaitlistStatus.WAITING,
    });

    const saved = await this.waitlistRepository.save(entry);

    await this.patientsService.logCommunication({
      patientId: dto.patientId,
      communicationMethod: CommunicationMethod.SMS,
      verified: true,
      interactionReason: 'Waitlist Registration',
      aiActions: `Patient registered on waitlist with ${starRating} rating for ${dto.appointmentType}.`,
      finalAction: 'Waitlist Enrolled',
      finalWorkflowStatus: 'Waitlist',
    });

    return saved;
  }

  async getWaitlist(clinicId?: string, physicianId?: string): Promise<WaitlistEntry[]> {
    const query = this.waitlistRepository.createQueryBuilder('w');
    if (clinicId) query.andWhere('w.clinic_id = :clinicId', { clinicId });
    if (physicianId) query.andWhere('w.physician_id = :physicianId', { physicianId });

    // Priority ordering: Red Star > Blue Star > Standard, then earliest created
    query.orderBy(
      `CASE 
        WHEN w.star_rating = '${StarRating.RED_STAR}' THEN 1 
        WHEN w.star_rating = '${StarRating.BLUE_STAR}' THEN 2 
        ELSE 3 
      END`,
      'ASC',
    );
    query.addOrderBy('w.created_at', 'ASC');

    return query.getMany();
  }

  /**
   * Scenario 10: Finds next eligible patient to backfill a cancelled slot.
   */
  async findNextEligiblePatient(
    clinicId: string,
    physicianId: string,
  ): Promise<WaitlistEntry | null> {
    const candidates = await this.waitlistRepository
      .createQueryBuilder('w')
      .where('w.clinic_id = :clinicId', { clinicId })
      .andWhere('(w.physician_id = :physicianId OR w.physician_id IS NULL)', { physicianId })
      .andWhere('w.status = :status', { status: WaitlistStatus.WAITING })
      .andWhere('(w.temporary_hold_until IS NULL OR w.temporary_hold_until < :now)', { now: new Date() })
      .orderBy(
        `CASE 
          WHEN w.star_rating = '${StarRating.RED_STAR}' THEN 1 
          WHEN w.star_rating = '${StarRating.BLUE_STAR}' THEN 2 
          ELSE 3 
        END`,
        'ASC',
      )
      .addOrderBy('w.created_at', 'ASC')
      .getMany();

    return candidates[0] || null;
  }

  /**
   * Scenario 11: Places temporary hold on the appointment slot so other patients
   * cannot take it simultaneously (preventing double booking).
   */
  async placeTemporaryHold(
    waitlistId: string,
    holdMinutes: number = 15,
  ): Promise<WaitlistEntry> {
    const entry = await this.waitlistRepository.findOne({ where: { id: waitlistId } });
    if (!entry) throw new NotFoundException(`Waitlist entry ${waitlistId} not found`);

    entry.status = WaitlistStatus.OFFERED;
    entry.temporaryHoldUntil = new Date(Date.now() + holdMinutes * 60 * 1000);

    const saved = await this.waitlistRepository.save(entry);
    this.logger.log(
      `[Scenario 11 - Temporary Hold] Slot held for patient ${entry.patientId} until ${entry.temporaryHoldUntil.toISOString()}`,
    );
    return saved;
  }

  async acceptOffer(waitlistId: string): Promise<WaitlistEntry> {
    const entry = await this.waitlistRepository.findOne({ where: { id: waitlistId } });
    if (!entry) throw new NotFoundException(`Waitlist entry ${waitlistId} not found`);

    entry.status = WaitlistStatus.ACCEPTED;
    entry.temporaryHoldUntil = null;
    const saved = await this.waitlistRepository.save(entry);

    await this.patientsService.logCommunication({
      patientId: entry.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: true,
      interactionReason: 'Waitlist Slot Offer Accepted',
      aiActions: 'Patient accepted earlier appointment offer. Moving appointment and confirming.',
      finalAction: 'Earlier Appointment Filled',
      finalWorkflowStatus: 'Appointment Confirmed',
    });

    return saved;
  }

  async declineOffer(waitlistId: string, reason?: string): Promise<{ entry: WaitlistEntry; nextEligiblePatient: WaitlistEntry | null }> {
    const entry = await this.waitlistRepository.findOne({ where: { id: waitlistId } });
    if (!entry) throw new NotFoundException(`Waitlist entry ${waitlistId} not found`);

    entry.status = WaitlistStatus.DECLINED;
    entry.temporaryHoldUntil = null;
    entry.notes = `${entry.notes || ''} [Declined offer: ${reason || 'Inconvenient time'}]`.trim();
    const saved = await this.waitlistRepository.save(entry);

    await this.patientsService.logCommunication({
      patientId: entry.patientId,
      communicationMethod: CommunicationMethod.PHONE,
      verified: true,
      interactionReason: 'Waitlist Slot Offer Declined',
      patientResponse: reason || 'Patient declined offer',
      aiActions: 'Recorded decline. Existing appointment preserved. Proceeding to next eligible patient.',
      finalAction: 'Proceed to Next Eligible Patient',
      finalWorkflowStatus: 'Patient Declined',
    });

    // Automatically find next eligible patient
    const nextPatient = await this.findNextEligiblePatient(entry.clinicId, entry.physicianId);
    return { entry: saved, nextEligiblePatient: nextPatient };
  }

  /**
   * Scans and clears expired holds, returning any slots that freed up.
   */
  async processExpiredHolds(): Promise<WaitlistEntry[]> {
    const expired = await this.waitlistRepository.find({
      where: {
        status: WaitlistStatus.OFFERED,
        temporaryHoldUntil: LessThan(new Date()),
      },
    });

    for (const item of expired) {
      item.status = WaitlistStatus.EXPIRED;
      item.temporaryHoldUntil = null;
      await this.waitlistRepository.save(item);
      this.logger.log(`Hold expired for waitlist entry ${item.id} (patient ${item.patientId}). Slot released.`);
    }

    return expired;
  }
}

