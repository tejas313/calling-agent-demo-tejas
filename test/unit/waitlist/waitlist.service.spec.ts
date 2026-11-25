import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WaitlistService } from '../../../src/waitlist/waitlist.service';
import { WaitlistEntry } from '../../../src/waitlist/entities/waitlist-entry.entity';
import { PatientsService } from '../../../src/patients/patients.service';
import { ClinicalPriority, StarRating, WaitlistStatus } from '../../../src/common/constants';

describe('WaitlistService', () => {
  let service: WaitlistService;
  let mockWaitlistRepo: any;
  let mockPatientsService: any;

  beforeEach(async () => {
    mockWaitlistRepo = {
      create: jest.fn((dto) => ({ id: 'w-1', ...dto })),
      save: jest.fn((entry) => Promise.resolve(entry)),
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockPatientsService = {
      logCommunication: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: getRepositoryToken(WaitlistEntry), useValue: mockWaitlistRepo },
        { provide: PatientsService, useValue: mockPatientsService },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
  });

  it('should add patient with Red Star priority to waitlist', async () => {
    const entry = await service.addToWaitlist({
      patientId: 'PAT-001',
      clinicId: 'CLINIC-001',
      appointmentType: 'Cardiology',
      priority: ClinicalPriority.RED_STAR,
      starRating: StarRating.RED_STAR,
    });

    expect(entry.starRating).toBe(StarRating.RED_STAR);
    expect(entry.status).toBe(WaitlistStatus.WAITING);
    expect(mockPatientsService.logCommunication).toHaveBeenCalled();
  });

  it('should place temporary hold on slot to prevent double-booking (Scenario 11)', async () => {
    const existing = {
      id: 'w-1',
      patientId: 'PAT-001',
      status: WaitlistStatus.WAITING,
      temporaryHoldUntil: null,
    };
    mockWaitlistRepo.findOne.mockResolvedValue(existing);

    const held = await service.placeTemporaryHold('w-1', 15);

    expect(held.status).toBe(WaitlistStatus.OFFERED);
    expect(held.temporaryHoldUntil).toBeInstanceOf(Date);
  });

  it('should decline offer and find next eligible patient', async () => {
    const existing = {
      id: 'w-1',
      patientId: 'PAT-001',
      clinicId: 'CLINIC-001',
      physicianId: 'PHY-001',
      status: WaitlistStatus.OFFERED,
      notes: '',
    };
    mockWaitlistRepo.findOne.mockResolvedValue(existing);

    // Mock query builder for findNextEligiblePatient
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 'w-2', patientId: 'PAT-002', starRating: StarRating.BLUE_STAR },
      ]),
    };
    mockWaitlistRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    const result = await service.declineOffer('w-1', 'Date is inconvenient');

    expect(result.entry.status).toBe(WaitlistStatus.DECLINED);
    expect(result.nextEligiblePatient?.patientId).toBe('PAT-002');
  });
});

