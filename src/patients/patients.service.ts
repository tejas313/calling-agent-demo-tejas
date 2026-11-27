import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientProfile } from '../entities';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectRepository(PatientProfile)
    private readonly patientRepository: Repository<PatientProfile>,
  ) {}

  async findAll(): Promise<PatientProfile[]> {
    try {
      return await this.patientRepository.find();
    } catch (error: any) {
      this.logger.error(`Error in findAll: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async findById(id: string): Promise<PatientProfile> {
    try {
      const patient = await this.patientRepository.findOne({ where: { id } });
      if (!patient) {
        throw new NotFoundException(`Patient with ID ${id} not found`);
      }
      return patient;
    } catch (error: any) {
      this.logger.error(`Error in findById for ID ${id}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async findByPhone(phone: string): Promise<PatientProfile | null> {
    try {
      const normalizedPhone = phone.replace(/\D/g, '');
      const patients = await this.patientRepository.find();
      return (
        patients.find((p) => (p.phone || '').replace(/\D/g, '') === normalizedPhone) || null
      );
    } catch (error: any) {
      this.logger.error(`Error in findByPhone for phone ${phone}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async verifyPatient(
    phoneNumber: string,
    patientId: string,
  ): Promise<{ verified: boolean; patientId?: string; patientName?: string; reason?: string }> {
    this.logger.log(`Attempting verification for patient ID: ${patientId} (phone number omitted)`);
    try {
      const patient = await this.findById(patientId);
      const normalizedInput = phoneNumber.replace(/\D/g, '');
      const normalizedStored = (patient.phone || '').replace(/\D/g, '');

      if (normalizedInput === normalizedStored) {
        return {
          verified: true,
          patientId: patient.id,
          patientName: `${patient.firstName} ${patient.lastName}`.trim(),
        };
      }

      return { verified: false, reason: 'Phone number does not match our records' };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return { verified: false, reason: 'Patient not found' };
      }
      this.logger.error(`Error in verifyPatient for patientId ${patientId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
