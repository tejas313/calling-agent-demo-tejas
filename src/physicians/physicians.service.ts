import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { Physician } from './entities/physician.entity';
import { CreatePhysicianDto } from './dto/create-physician.dto';

@Injectable()
export class PhysiciansService {
  constructor(
    @InjectRepository(Physician)
    private readonly physicianRepository: Repository<Physician>,
  ) {}

  async findAll(): Promise<Physician[]> {
    return this.physicianRepository.find();
  }

  async findById(id: string): Promise<Physician> {
    const physician = await this.physicianRepository.findOne({ where: { id } });
    if (!physician) {
      throw new NotFoundException(`Physician with id ${id} not found`);
    }
    return physician;
  }

  async findBySpecialty(specialty: string): Promise<Physician[]> {
    return this.physicianRepository.find({
      where: { specialty: ILike(`%${specialty}%`) },
    });
  }

  async findByClinic(clinicId: string): Promise<Physician[]> {
    return this.physicianRepository.find({ where: { clinicId } });
  }

  async createOrUpdate(dto: CreatePhysicianDto): Promise<Physician> {
    const existing = await this.physicianRepository.findOne({ where: { id: dto.id } });
    if (existing) {
      Object.assign(existing, dto);
      return this.physicianRepository.save(existing);
    }
    const physician = this.physicianRepository.create(dto);
    return this.physicianRepository.save(physician);
  }

  async incrementReferrals(id: string): Promise<void> {
    await this.physicianRepository.increment({ id }, 'activeReferralsCount', 1);
  }

  async decrementReferrals(id: string): Promise<void> {
    await this.physicianRepository.decrement({ id }, 'activeReferralsCount', 1);
  }
}

