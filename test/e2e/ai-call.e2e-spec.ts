import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TwilioService } from '../../src/twilio/twilio.service';
import { CallStatus, CallType } from '../../src/common/constants';

describe('AiCallController (e2e)', () => {
  let app: INestApplication;
  let mockTwilioService: any;
  let mockDataSource: any;

  beforeAll(async () => {
    mockTwilioService = {
      createOutboundCall: jest.fn().mockResolvedValue({ callSid: 'CA-TEST-SID' }),
    };

    mockDataSource = {
      query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('FROM patient_profiles')) {
          return [{ id: 'PAT-001', firstName: 'John', lastName: 'Doe' }];
        }
        if (sql.includes('FROM triage_assignments')) {
          return [
            {
              id: 'APT-001',
              approvedDate: new Date(),
              scheduleCount: 0,
              scheduleUnit: 1,
              assignedPhysicianId: 'PHY-001',
            },
          ];
        }
        if (sql.includes('FROM physician_clinic_profiles')) {
          return [{ id: 'PHY-001', clinicId: 'CLINIC-001' }];
        }
        if (sql.includes('FROM physician_patient_slots')) {
          return [
            {
              id: 'slot-1',
              date: '2026-11-28',
              startTime: '10:00 AM',
              endTime: '10:30 AM',
              status: 1,
            },
          ];
        }
        if (sql.includes('INSERT INTO ai_calls') || sql.includes('UPDATE ai_calls')) {
          return [
            {
              id: 'CALL-001',
              status: CallStatus.INITIATED,
              patientId: 'PAT-001',
              clinicId: 'CLINIC-001',
              assignmentsId: 'APT-001',
              assignedPhysicianId: 'PHY-001',
              slotId: 'slot-1',
              phoneNumber: '+14165551234',
              language: 'en',
              callType: CallType.APPOINTMENT_CONFIRMATION,
              transcript: [],
              conversationHistory: [],
              currentTurn: 0,
            },
          ];
        }
        if (sql.includes('FROM ai_calls')) {
          if (params && params[0] === 'CALL-001') {
            return [
              {
                id: 'CALL-001',
                status: CallStatus.INITIATED,
                transcript: [],
                conversationHistory: [],
              },
            ];
          }
          return [];
        }
        if (sql.includes('INSERT INTO ai_call_logs')) {
          return [];
        }
        return [];
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TwilioService)
      .useValue(mockTwilioService)
      .overrideProvider(DataSource)
      .useValue(mockDataSource)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /ai-call/start', () => {
    it('should create an AI call with valid body', async () => {
      const response = await request(app.getHttpServer())
        .post('/ai-call/start')
        .send({
          phoneNumber: '+14165551234',
          patientId: 'PAT-001',
          clinicId: 'CLINIC-001',
          assignmentsId: 'APT-001',
          appointmentId: 'APT-001',
          language: 'en',
          callType: CallType.APPOINTMENT_CONFIRMATION,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        code: 1,
        status: 'SUCCESS',
      });
      expect(response.body.data).toHaveProperty('callId');
    });

    it('should return 400 with invalid body (missing phoneNumber)', async () => {
      await request(app.getHttpServer())
        .post('/ai-call/start')
        .send({
          patientId: 'PAT-001',
          clinicId: 'CLINIC-001',
          assignmentsId: 'APT-001',
          appointmentId: 'APT-001',
          callType: CallType.APPOINTMENT_CONFIRMATION,
        })
        .expect(400);
    });
  });

  describe('GET /ai-call/:id', () => {
    it('should return 404 for non-existent call', async () => {
      await request(app.getHttpServer()).get('/ai-call/CALL-999').expect(404);
    });

    it('should return 200 for existing call', async () => {
      const response = await request(app.getHttpServer()).get('/ai-call/CALL-001').expect(200);

      expect(response.body).toMatchObject({
        code: 1,
        status: 'SUCCESS',
      });
      expect(response.body.data).toHaveProperty('id', 'CALL-001');
    });
  });
});
