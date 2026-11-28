import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PatientProfile } from '../common';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async rawQuery<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (this.dataSource && typeof this.dataSource.query === 'function') {
      return this.dataSource.query(sql, params);
    }
    throw new Error('No database connection available for raw query');
  }

  async findAll(): Promise<PatientProfile[]> {
    try {
      const sql = `
        SELECT
          id,
          user_id AS "userId",
          clinic_id AS "clinicId",
          "firstName",
          "lastName",
          "dateOfBirth",
          phone,
          email,
          address,
          city,
          "zipCode",
          "healthCardNumber",
          "languageType",
          "emailNotifications",
          "smsNotifications",
          "hasAcceptedTerms",
          "isOnboardingComplete",
          "lastCompletedStep",
          "isActive",
          "createdAt",
          "updatedAt"
        FROM patient_profiles
        ORDER BY "createdAt" DESC
      `;
      return await this.rawQuery<PatientProfile[]>(sql);
    } catch (error: any) {
      this.logger.error(`Error in findAll: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async findById(id: string): Promise<PatientProfile> {
    try {
      const sql = `
        SELECT
          id,
          user_id AS "userId",
          clinic_id AS "clinicId",
          "firstName",
          "lastName",
          "dateOfBirth",
          phone,
          email,
          address,
          city,
          "zipCode",
          "healthCardNumber",
          "languageType",
          "emailNotifications",
          "smsNotifications",
          "hasAcceptedTerms",
          "isOnboardingComplete",
          "lastCompletedStep",
          "isActive",
          "createdAt",
          "updatedAt"
        FROM patient_profiles
        WHERE id = $1
        LIMIT 1
      `;
      const rows = await this.rawQuery<PatientProfile[]>(sql, [id]);
      const patient = rows && rows.length > 0 ? rows[0] : null;
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
      const sql = `
        SELECT
          id,
          user_id AS "userId",
          clinic_id AS "clinicId",
          "firstName",
          "lastName",
          "dateOfBirth",
          phone,
          email,
          address,
          city,
          "zipCode",
          "healthCardNumber",
          "languageType",
          "emailNotifications",
          "smsNotifications",
          "hasAcceptedTerms",
          "isOnboardingComplete",
          "lastCompletedStep",
          "isActive",
          "createdAt",
          "updatedAt"
        FROM patient_profiles
        WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
        LIMIT 1
      `;
      const rows = await this.rawQuery<PatientProfile[]>(sql, [normalizedPhone]);
      return rows && rows.length > 0 ? rows[0] : null;
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
