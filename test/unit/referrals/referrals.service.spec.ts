import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReferralsService } from '../../../src/referrals/referrals.service';
import { Referral } from '../../../src/referrals/entities/referral.entity';
import { ReferralExtractionService } from '../../../src/referrals/referral-extraction.service';
import { ReferralDistributionService } from '../../../src/referrals/referral-distribution.service';
import { PatientsService } from '../../../src/patients/patients.service';
import { ClinicalPriority, ReviewStatus, ReferralStatus } from '../../../src/common/constants';

describe('ReferralsService', () => {
  let service: ReferralsService;
  let mockReferralRepo: any;
  let mockExtractionService: any;
  let mockDistributionService: any;
  let mockPatientsService: any;

  beforeEach(async () => {
    mockReferralRepo = {
      create: jest.fn((dto) => ({ id: 'ref-123', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockExtractionService = {
      extractReferralData: jest.fn().mockResolvedValue({
        patientName: 'Jane Doe',
        patientPhone: '+14165551122',
        referringPhysicianName: 'Dr. Robert Smith',
        referralReason: 'Suspected coronary artery disease',
        specialtyRequired: 'Cardiology',
        clinicalPriority: ClinicalPriority.RED_STAR,
        targetWaitDays: 2,
        confidenceScore: 0.95,
      }),
    };

    mockDistributionService = {
      distributeReferral: jest.fn().mockResolvedValue({
        assignedPhysicianId: 'PHY-001',
        physicianName: 'Dr. Sarah Chen',
        specialty: 'Cardiology',
        workloadScore: 1.2,
        distributionRationale: 'Assigned to Dr. Sarah Chen based on workload score 1.2',
      }),
    };

    mockPatientsService = {
      findByPhone: jest.fn().mockResolvedValue({ id: 'PAT-001', name: 'Jane Doe' }),
      createOrUpdate: jest.fn(),
      logCommunication: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        { provide: getRepositoryToken(Referral), useValue: mockReferralRepo },
        { provide: ReferralExtractionService, useValue: mockExtractionService },
        { provide: ReferralDistributionService, useValue: mockDistributionService },
        { provide: PatientsService, useValue: mockPatientsService },
      ],
    }).compile();

    service = module.get<ReferralsService>(ReferralsService);
  });

  it('should extract and create referral with AI distribution and pending review status', async () => {
    const result = await service.extractAndCreate({
      documentText: 'Referral for Jane Doe by Dr. Robert Smith',
      clinicId: 'CLINIC-001',
    });

    expect(mockExtractionService.extractReferralData).toHaveBeenCalled();
    expect(mockDistributionService.distributeReferral).toHaveBeenCalledWith('Cardiology', ClinicalPriority.RED_STAR);
    expect(result.clinicalPriority).toBe(ClinicalPriority.RED_STAR);
    expect(result.reviewStatus).toBe(ReviewStatus.PENDING_REVIEW);
    expect(result.assignedPhysicianId).toBe('PHY-001');
    expect(mockPatientsService.logCommunication).toHaveBeenCalled();
  });

  it('should allow physician to review and approve clinical priority', async () => {
    const existingReferral = {
      id: 'ref-123',
      patientId: 'PAT-001',
      clinicalPriority: ClinicalPriority.ROUTINE,
      reviewStatus: ReviewStatus.PENDING_REVIEW,
      status: ReferralStatus.TRIAGED,
    };
    mockReferralRepo.findOne.mockResolvedValue(existingReferral);

    const result = await service.reviewReferral('ref-123', {
      clinicalPriority: ClinicalPriority.RED_STAR,
      targetWaitDays: 2,
      physicianNotes: 'Urgent red star review approved',
      action: 'APPROVE',
    });

    expect(result.clinicalPriority).toBe(ClinicalPriority.RED_STAR);
    expect(result.reviewStatus).toBe(ReviewStatus.APPROVED);
    expect(result.targetWaitDays).toBe(2);
    expect(mockPatientsService.logCommunication).toHaveBeenCalled();
  });
});

