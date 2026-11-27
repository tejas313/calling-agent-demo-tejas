import { Controller, Get, Param, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { PatientsService } from './patients.service';
import { ResponseService } from '../common/response.service';

@ApiTags('Patients')
@Controller('patients')
export class PatientsController {
  private readonly logger = new Logger(PatientsController.name);

  constructor(
    private readonly patientsService: PatientsService,
    private readonly responseService: ResponseService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all patients' })
  @ApiResponse({ status: 200, description: 'List of patients returned successfully.' })
  async findAll(@Req() req: Request, @Res() res: Response) {
    try {
      const data = await this.patientsService.findAll();
      return this.responseService.success(res, 'PATIENTS_RETRIEVED_SUCCESSFULLY', data);
    } catch (error: any) {
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'FAILED_TO_GET_PATIENTS', statusCode);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a patient by ID' })
  @ApiResponse({ status: 200, description: 'Patient found.' })
  @ApiResponse({ status: 404, description: 'Patient not found.' })
  async findById(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    try {
      const data = await this.patientsService.findById(id);
      return this.responseService.success(res, 'PATIENT_RETRIEVED_SUCCESSFULLY', data);
    } catch (error: any) {
      const statusCode = error?.status || (error?.getStatus ? error.getStatus() : 500);
      return this.responseService.error(req, res, error?.message || 'FAILED_TO_GET_PATIENT', statusCode);
    }
  }
}
