import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PhysiciansService } from './physicians.service';
import { CreatePhysicianDto } from './dto/create-physician.dto';

@ApiTags('Physicians')
@Controller('physicians')
export class PhysiciansController {
  constructor(private readonly physiciansService: PhysiciansService) {}

  @Get()
  @ApiOperation({ summary: 'List all physicians or filter by specialty' })
  async findAll(@Query('specialty') specialty?: string) {
    if (specialty) {
      return this.physiciansService.findBySpecialty(specialty);
    }
    return this.physiciansService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get physician details' })
  async findById(@Param('id') id: string) {
    return this.physiciansService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create or update physician profile' })
  async createOrUpdate(@Body() dto: CreatePhysicianDto) {
    return this.physiciansService.createOrUpdate(dto);
  }
}

