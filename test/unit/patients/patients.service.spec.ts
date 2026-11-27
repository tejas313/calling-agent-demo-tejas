import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PatientsService } from '../../../src/patients/patients.service';
import { PatientProfile } from '../../../src/entities/patient-profile.entity';

const mockPatient: Partial<PatientProfile> = {
  id: 'PAT-001',
  firstName: 'John',
  lastName: 'Smith',
  phone: '+14165551001',
  dateOfBirth: new Date('1980-03-15'),
  clinicId: 'CLINIC-001',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PatientsService', () => {
  let service: PatientsService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([mockPatient]),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: getRepositoryToken(PatientProfile),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  describe('findById', () => {
    it('should return patient when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockPatient);
      const result = await service.findById('PAT-001');
      expect(result).toEqual(mockPatient);
      expect(mockRepository.findOne).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.findById('PAT-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPhone', () => {
    it('should return patient by phone when found', async () => {
      mockRepository.find.mockResolvedValue([mockPatient]);
      const result = await service.findByPhone('+14165551001');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('PAT-001');
    });

    it('should return null when patient not found by phone', async () => {
      mockRepository.find.mockResolvedValue([mockPatient]);
      const result = await service.findByPhone('+14165559999');
      expect(result).toBeNull();
    });
  });

  describe('verifyPatient', () => {
    it('should return verified=true when phone matches', async () => {
      mockRepository.findOne.mockResolvedValue(mockPatient);
      const result = await service.verifyPatient('+14165551001', 'PAT-001');
      expect(result.verified).toBe(true);
      expect(result.patientId).toBe('PAT-001');
      expect(result.patientName).toBe('John Smith');
    });

    it('should return verified=false when phone does not match', async () => {
      mockRepository.findOne.mockResolvedValue(mockPatient);
      const result = await service.verifyPatient('+14165559999', 'PAT-001');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Phone number');
    });

    it('should return verified=false when patient not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const result = await service.verifyPatient('+14165551001', 'PAT-999');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should handle normalized phone numbers (strip +, dashes, spaces)', async () => {
      mockRepository.findOne.mockResolvedValue(mockPatient);
      const result = await service.verifyPatient('14165551001', 'PAT-001');
      expect(result.verified).toBe(true);
    });
  });
});
