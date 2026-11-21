import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
  ) {}

  async findAll(): Promise<Patient[]> {
    return this.patientRepository.find();
  }

  async findById(id: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({ where: { id } as any });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
    return patient;
  }

  async findByPhone(phone: string): Promise<Patient | null> {
    const normalizedPhone = phone.replace(/\D/g, '');
    const patients = await this.patientRepository.find();
    return (
      patients.find((p) => ((p as any).phone || '').replace(/\D/g, '') === normalizedPhone) || null
    );
  }

  async verifyPatient(
    phoneNumber: string,
    patientId: string,
  ): Promise<{ verified: boolean; patientId?: string; patientName?: string; reason?: string }> {
    this.logger.log(`Attempting verification for patient ID: ${patientId} (phone number omitted)`);
    try {
      const patient = await this.findById(patientId);
      const normalizedInput = phoneNumber.replace(/\D/g, '');
      const normalizedStored = ((patient as any).phone || '').replace(/\D/g, '');

      if (normalizedInput === normalizedStored) {
        return {
          verified: true,
          patientId: (patient as any).id,
          patientName: (patient as any).name,
        };
      }

      return { verified: false, reason: 'Phone number does not match our records' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { verified: false, reason: 'Patient not found' };
      }
      throw error;
    }
  }
}
