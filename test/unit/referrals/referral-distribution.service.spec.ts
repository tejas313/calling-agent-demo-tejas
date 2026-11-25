import { Test, TestingModule } from '@nestjs/testing';
import { ReferralDistributionService } from '../../../src/referrals/referral-distribution.service';
import { PhysiciansService } from '../../../src/physicians/physicians.service';
import { ClinicalPriority } from '../../../src/common/constants';

describe('ReferralDistributionService', () => {
  let service: ReferralDistributionService;
  let mockPhysiciansService: any;

  beforeEach(async () => {
    mockPhysiciansService = {
      findBySpecialty: jest.fn(),
      findAll: jest.fn(),
      incrementReferrals: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralDistributionService,
        { provide: PhysiciansService, useValue: mockPhysiciansService },
      ],
    }).compile();

    service = module.get<ReferralDistributionService>(ReferralDistributionService);
  });

  it('should distribute referral to matching specialty physician with lowest workload', async () => {
    const physicians = [
      { id: 'PHY-001', name: 'Dr. Sarah Chen', specialty: 'Cardiology', activeReferralsCount: 5, maxDailyAppointments: 20 },
      { id: 'PHY-002', name: 'Dr. Mark Davis', specialty: 'Cardiology', activeReferralsCount: 1, maxDailyAppointments: 20 },
    ];

    mockPhysiciansService.findBySpecialty.mockResolvedValue(physicians);

    const result = await service.distributeReferral('Cardiology', ClinicalPriority.URGENT);

    expect(result.assignedPhysicianId).toBe('PHY-002');
    expect(result.physicianName).toBe('Dr. Mark Davis');
    expect(mockPhysiciansService.incrementReferrals).toHaveBeenCalledWith('PHY-002');
  });

  it('should fallback to all physicians if no exact specialty match', async () => {
    mockPhysiciansService.findBySpecialty.mockResolvedValue([]);
    mockPhysiciansService.findAll.mockResolvedValue([
      { id: 'PHY-GEN', name: 'Dr. General', specialty: 'Family Medicine', activeReferralsCount: 0, maxDailyAppointments: 20 },
    ]);

    const result = await service.distributeReferral('RareSubSpecialty', ClinicalPriority.ROUTINE);

    expect(result.assignedPhysicianId).toBe('PHY-GEN');
    expect(mockPhysiciansService.incrementReferrals).toHaveBeenCalledWith('PHY-GEN');
  });
});

