import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { CommunicationLogService, CreateCommunicationLogDto } from './communication-log.service';
import { CommunicationLog } from './entities/communication-log.entity';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @Optional()
    private readonly communicationLogService?: CommunicationLogService,
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

  async createOrUpdate(patientData: Partial<Patient>): Promise<Patient> {
    if (patientData.id) {
      const existing = await this.patientRepository.findOne({ where: { id: patientData.id } as any });
      if (existing) {
        Object.assign(existing, patientData);
        return this.patientRepository.save(existing);
      }
    }
    const newPatient = this.patientRepository.create(patientData as Patient);
    return this.patientRepository.save(newPatient);
  }

  async verifyPatient(
    phoneNumber: string,
    patientId: string,
  ): Promise<{ verified: boolean; patientId?: string; patientName?: string; reason?: string }> {
    this.logger.log(`Attempting verification for patient ID: ${patientId}`);
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

  async logCommunication(dto: CreateCommunicationLogDto): Promise<CommunicationLog | null> {
    if (this.communicationLogService) {
      return this.communicationLogService.log(dto);
    }
    return null;
  }

  async getChartLogs(patientId: string): Promise<CommunicationLog[]> {
    if (this.communicationLogService) {
      return this.communicationLogService.getLogsByPatient(patientId);
    }
    return [];
  }
}
