import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TwilioService } from '../../src/twilio/twilio.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiCall } from '../../src/ai-call/entities/ai-call.entity';
import { Patient } from '../../src/patients/entities/patient.entity';
import { Appointment } from '../../src/appointments/entities/appointment.entity';
import { CallStatus, CallType } from '../../src/common/constants';

describe('AiCallController (e2e)', () => {
  let app: INestApplication;
  let mockTwilioService: any;
  let mockAiCallRepository: any;

  beforeAll(async () => {
    mockTwilioService = {
      createOutboundCall: jest.fn().mockResolvedValue({ callSid: 'CA-TEST-SID' }),
    };

    mockAiCallRepository = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve({ ...entity, id: 'CALL-001' })),
      findOne: jest.fn(),
    };

    const mockPatientRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'PAT-001', name: 'John Doe' }),
    };

    const mockAppointmentRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'APT-001', status: 'PENDING' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TwilioService)
      .useValue(mockTwilioService)
      .overrideProvider(getRepositoryToken(AiCall))
      .useValue(mockAiCallRepository)
      .overrideProvider(getRepositoryToken(Patient))
      .useValue(mockPatientRepository)
      .overrideProvider(getRepositoryToken(Appointment))
      .useValue(mockAppointmentRepository)
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
          appointmentId: 'APT-001',
          language: 'en',
          callType: CallType.APPOINTMENT_CONFIRMATION,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        twilioCallSid: 'CA-TEST-SID',
        status: 'initiated',
      });
      expect(response.body).toHaveProperty('callId');
    });

    it('should return 400 with invalid body (missing phoneNumber)', async () => {
      await request(app.getHttpServer())
        .post('/ai-call/start')
        .send({
          patientId: 'PAT-001',
          clinicId: 'CLINIC-001',
          appointmentId: 'APT-001',
          callType: CallType.APPOINTMENT_CONFIRMATION,
        })
        .expect(400);
    });
  });

  describe('GET /ai-call/:id', () => {
    it('should return 404 for non-existent call', async () => {
      mockAiCallRepository.findOne.mockResolvedValueOnce(null);

      await request(app.getHttpServer()).get('/ai-call/CALL-999').expect(404);
    });

    it('should return 200 for existing call', async () => {
      mockAiCallRepository.findOne.mockResolvedValueOnce({
        id: 'CALL-001',
        status: CallStatus.INITIATED,
      });

      const response = await request(app.getHttpServer()).get('/ai-call/CALL-001').expect(200);

      expect(response.body).toHaveProperty('id', 'CALL-001');
    });
  });
});
