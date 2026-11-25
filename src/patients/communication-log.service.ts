import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunicationLog } from './entities/communication-log.entity';
import { CommunicationMethod } from '../common/constants';

export interface CreateCommunicationLogDto {
  patientId: string;
  communicationMethod: CommunicationMethod;
  verified?: boolean;
  interactionReason?: string;
  patientRequest?: string;
  aiActions?: string;
  appointmentOffered?: string;
  patientResponse?: string;
  physicianContacted?: string;
  physicianResponse?: string;
  finalAction?: string;
  escalationStatus?: string;
  finalWorkflowStatus?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class CommunicationLogService {
  private readonly logger = new Logger(CommunicationLogService.name);

  constructor(
    @InjectRepository(CommunicationLog)
    private readonly logRepository: Repository<CommunicationLog>,
  ) {}

  async log(dto: CreateCommunicationLogDto): Promise<CommunicationLog> {
    const entry = this.logRepository.create({
      ...dto,
      dateTime: new Date(),
    });
    const saved = await this.logRepository.save(entry);
    this.logger.log(
      `[CommunicationLog] Saved chart entry for patient=${dto.patientId}, method=${dto.communicationMethod}, status=${dto.finalWorkflowStatus || 'N/A'}`,
    );
    return saved;
  }

  async getLogsByPatient(patientId: string): Promise<CommunicationLog[]> {
    return this.logRepository.find({
      where: { patientId },
      order: { dateTime: 'DESC' },
    });
  }
}

