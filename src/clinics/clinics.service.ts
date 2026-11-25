import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clinic } from './entities/clinic.entity';
import { CreateClinicDto } from './dto/create-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(
    @InjectRepository(Clinic)
    private readonly clinicRepository: Repository<Clinic>,
  ) {}

  async findAll(): Promise<Clinic[]> {
    return this.clinicRepository.find();
  }

  async findById(id: string): Promise<Clinic> {
    const clinic = await this.clinicRepository.findOne({ where: { id } });
    if (!clinic) {
      throw new NotFoundException(`Clinic with id ${id} not found`);
    }
    return clinic;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<Clinic | null> {
    return this.clinicRepository.findOne({
      where: [{ twilioPhoneNumber: phoneNumber }, { phone: phoneNumber }],
    });
  }

  async createOrUpdate(dto: CreateClinicDto): Promise<Clinic> {
    const existing = await this.clinicRepository.findOne({ where: { id: dto.id } });
    if (existing) {
      Object.assign(existing, dto);
      return this.clinicRepository.save(existing);
    }
    const clinic = this.clinicRepository.create(dto);
    return this.clinicRepository.save(clinic);
  }
}

