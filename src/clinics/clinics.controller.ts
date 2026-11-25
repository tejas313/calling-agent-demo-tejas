import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto } from './dto/create-clinic.dto';

@ApiTags('Clinics')
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get()
  @ApiOperation({ summary: 'List all clinics' })
  async findAll() {
    return this.clinicsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clinic by ID' })
  async findById(@Param('id') id: string) {
    return this.clinicsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create or update clinic config with Twilio credentials' })
  async createOrUpdate(@Body() dto: CreateClinicDto) {
    return this.clinicsService.createOrUpdate(dto);
  }
}

