import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { PatientsService } from '../../../src/patients/patients.service';
import { PatientProfile } from '../../../src/common';

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
  let mockDataSource: any;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('WHERE id = $1')) {
          if (params && params[0] === 'PAT-001') {
            return [mockPatient];
          }
          return [];
        }
        if (sql.includes('regexp_replace')) {
          if (params && params[0] === '14165551001') {
            return [mockPatient];
          }
          return [];
        }
        return [mockPatient];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  describe('findAll', () => {
    it('should return all patients via raw query', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockPatient]);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM patient_profiles'),
        [],
      );
    });
  });

  describe('findById', () => {
    it('should return patient when found via raw query', async () => {
      const result = await service.findById('PAT-001');
      expect(result).toEqual(mockPatient);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['PAT-001'],
      );
    });

    it('should throw NotFoundException when not found', async () => {
      await expect(service.findById('PAT-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPhone', () => {
    it('should return patient by phone when found via raw query', async () => {
      const result = await service.findByPhone('+14165551001');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('PAT-001');
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('regexp_replace'),
        ['14165551001'],
      );
    });

    it('should return null when patient not found by phone', async () => {
      const result = await service.findByPhone('+14165559999');
      expect(result).toBeNull();
    });
  });

  describe('verifyPatient', () => {
    it('should return verified=true when phone matches', async () => {
      const result = await service.verifyPatient('+14165551001', 'PAT-001');
      expect(result.verified).toBe(true);
      expect(result.patientId).toBe('PAT-001');
      expect(result.patientName).toBe('John Smith');
    });

    it('should return verified=false when phone does not match', async () => {
      const result = await service.verifyPatient('+14165559999', 'PAT-001');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Phone number');
    });

    it('should return verified=false when patient not found', async () => {
      const result = await service.verifyPatient('+14165551001', 'PAT-999');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should handle normalized phone numbers (strip +, dashes, spaces)', async () => {
      const result = await service.verifyPatient('14165551001', 'PAT-001');
      expect(result.verified).toBe(true);
    });
  });
});
