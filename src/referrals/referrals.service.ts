import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from './entities/referral.entity';
import { ExtractReferralDto } from './dto/extract-referral.dto';
import { ReviewReferralDto } from './dto/review-referral.dto';
import { ReferralExtractionService } from './referral-extraction.service';
import { ReferralDistributionService } from './referral-distribution.service';
import { PatientsService } from '../patients/patients.service';
import {
  ReferralStatus,
  ReviewStatus,
  CommunicationMethod,
} from '../common/constants';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    private readonly extractionService: ReferralExtractionService,
    private readonly distributionService: ReferralDistributionService,
    private readonly patientsService: PatientsService,
  ) {}

  /**
   * AI-powered ingestion & extraction:
   * 1. Extracts clinical & demographic data via OpenAI / Gemini.
   * 2. Matches or registers patient.
   * 3. AI distributes referral to best physician based on workload and specialty.
   * 4. Logs to patient chart.
   */
  async extractAndCreate(dto: ExtractReferralDto): Promise<Referral> {
    this.logger.log('Starting AI referral extraction and triage workflow...');

    // 1. AI Extraction
    const extracted = await this.extractionService.extractReferralData(dto.documentText);

    // 2. Patient match or create
    let patientId: string | undefined;
    if (extracted.patientPhone) {
      const existingPatient = await this.patientsService.findByPhone(extracted.patientPhone);
      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        const newPatient = await this.patientsService.createOrUpdate({
          id: `PAT-${Date.now().toString().slice(-6)}`,
          name: extracted.patientName,
          phone: extracted.patientPhone,
          dateOfBirth: extracted.patientDob ? new Date(extracted.patientDob) : undefined,
          clinicId: dto.clinicId || 'CLINIC-001',
        });
        patientId = newPatient.id;
      }
    }

    // 3. AI Distribution based on physician specialty & workload
    const distribution = await this.distributionService.distributeReferral(
      extracted.specialtyRequired,
      extracted.clinicalPriority,
    );

    // 4. Save Referral Record
    const referral = this.referralRepository.create({
      patientName: extracted.patientName,
      patientPhone: extracted.patientPhone,
      patientDob: extracted.patientDob ? new Date(extracted.patientDob) : undefined,
      patientId,
      referringPhysicianName: extracted.referringPhysicianName,
      referringPhysicianBillingNumber: extracted.referringPhysicianBillingNumber,
      referringPhysicianContact: extracted.referringPhysicianContact,
      referralReason: extracted.referralReason,
      specialtyRequired: extracted.specialtyRequired,
      clinicalPriority: extracted.clinicalPriority,
      targetWaitDays: extracted.targetWaitDays,
      assignedPhysicianId: distribution.assignedPhysicianId,
      workloadScoreAtAssignment: distribution.workloadScore,
      reviewStatus: ReviewStatus.PENDING_REVIEW,
      status: ReferralStatus.TRIAGED,
      extractedData: {
        ...extracted,
        distributionRationale: distribution.distributionRationale,
        rawDocumentText: dto.documentText,
      },
    });

    const saved = await this.referralRepository.save(referral);

    // 5. Log interaction to patient chart
    if (patientId) {
      await this.patientsService.logCommunication({
        patientId,
        communicationMethod: CommunicationMethod.SMS,
        verified: true,
        interactionReason: 'Referral Received & AI Triage',
        patientRequest: extracted.referralReason,
        aiActions: `AI extracted clinical priority: ${extracted.clinicalPriority}, assigned to ${distribution.physicianName} (${distribution.specialty}). Pending physician review.`,
        finalAction: 'Awaiting Physician Review',
        finalWorkflowStatus: 'Pending Physician Review',
      });
    }

    this.logger.log(`Referral ${saved.id} successfully created and pending physician review.`);
    return saved;
  }

  async getPendingReview(): Promise<Referral[]> {
    return this.referralRepository.find({
      where: { reviewStatus: ReviewStatus.PENDING_REVIEW },
      order: { createdAt: 'ASC' },
    });
  }

  async findAll(): Promise<Referral[]> {
    return this.referralRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<Referral> {
    const referral = await this.referralRepository.findOne({ where: { id } });
    if (!referral) {
      throw new NotFoundException(`Referral ${id} not found`);
    }
    return referral;
  }

  /**
   * Physician reviews and approves/modifies clinical priority.
   */
  async reviewReferral(id: string, dto: ReviewReferralDto): Promise<Referral> {
    const referral = await this.findById(id);

    if (dto.clinicalPriority) {
      referral.clinicalPriority = dto.clinicalPriority;
    }
    if (dto.targetWaitDays) {
      referral.targetWaitDays = dto.targetWaitDays;
    }
    if (dto.assignedPhysicianId) {
      referral.assignedPhysicianId = dto.assignedPhysicianId;
    }
    if (dto.physicianNotes) {
      referral.physicianNotes = dto.physicianNotes;
    }

    if (dto.action === 'APPROVE') {
      referral.reviewStatus = ReviewStatus.APPROVED;
    } else if (dto.action === 'MODIFY') {
      referral.reviewStatus = ReviewStatus.MODIFIED;
    } else if (dto.action === 'REJECT') {
      referral.reviewStatus = ReviewStatus.REJECTED;
      referral.status = ReferralStatus.ARCHIVED;
    }

    const updated = await this.referralRepository.save(referral);

    // Chart documentation
    if (referral.patientId) {
      await this.patientsService.logCommunication({
        patientId: referral.patientId,
        communicationMethod: CommunicationMethod.PHONE,
        verified: true,
        interactionReason: 'Physician Referral Review',
        aiActions: `Physician updated status to ${referral.reviewStatus}. Priority: ${referral.clinicalPriority}. Notes: ${dto.physicianNotes || 'None'}.`,
        finalAction: `Review: ${dto.action}`,
        finalWorkflowStatus: `Referral ${referral.reviewStatus}`,
      });
    }

    return updated;
  }
}

