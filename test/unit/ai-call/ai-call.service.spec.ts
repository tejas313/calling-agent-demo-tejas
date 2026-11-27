import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dayjs: typeof import('dayjs') = require('dayjs');
import { AiCallService } from '../../../src/ai-call/ai-call.service';
import { CallType } from '../../../src/common/constants';

describe('AiCallService', () => {
  let service: AiCallService;
  let aiCallRepo: any;
  let aiCallLogRepo: any;
  let patientRepo: any;
  let assignmentRepo: any;
  let physicianRepo: any;
  let slotRepo: any;
  let bookingRepo: any;
  let dataSource: any;
  let twilioService: any;
  let agentService: any;

  const baseDto = {
    phoneNumber: '+18735060917',
    patientId: 'pat-1',
    clinicId: 'clinic-1',
    assignmentsId: 'assign-1',
    assigned_physician_id: 'phys-1',
    appointment_type_id: 'apt-type-1',
    language: 'en',
    callType: CallType.APPOINTMENT_CONFIRMATION,
    testMode: true,
  };

  beforeEach(() => {
    aiCallRepo = {
      create: jest.fn((v) => ({ id: 'call-1', ...v })),
      save: jest.fn(async (v) => v),
      findOne: jest.fn(),
    };
    aiCallLogRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      find: jest.fn().mockResolvedValue([]),
    };
    patientRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'pat-1', firstName: 'Suresh', lastName: 'Bhai' }),
    };
    assignmentRepo = {
      findOne: jest.fn(),
    };
    physicianRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'phys-1', clinicId: 'clinic-1' }),
    };

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    slotRepo = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn(),
      save: jest.fn(async (v) => v),
      _qb: qb,
    };
    bookingRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => ({ id: 'booking-1', ...v })),
      save: jest.fn(async (v) => v),
    };
    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({
          getRepository: (entity: any) => {
            if (entity.name === 'PhysicianPatientSlot') return slotRepo;
            return bookingRepo;
          },
        }),
      ),
    };
    twilioService = {
      createOutboundCall: jest.fn().mockResolvedValue({ callSid: 'CA-1' }),
    };
    agentService = {
      warmContext: jest.fn().mockResolvedValue(undefined),
      clearContextCache: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'PUBLIC_BASE_URL' ? 'https://example.trycloudflare.com' : undefined,
      ),
    } as unknown as ConfigService;

    service = new AiCallService(
      aiCallRepo,
      aiCallLogRepo,
      patientRepo,
      assignmentRepo,
      physicianRepo,
      slotRepo,
      bookingRepo,
      dataSource,
      twilioService,
      agentService,
      configService,
    );
  });

  it('blocks startCall and stores CALL_BLOCKED log when approvedDate is missing on triage assignment', async () => {
    assignmentRepo.findOne.mockResolvedValue({
      id: 'assign-1',
      approvedDate: null,
      scheduleCount: 1,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    });

    await expect(service.startCall({ ...baseDto })).rejects.toThrow(BadRequestException);
    expect(aiCallLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'CALL_BLOCKED',
        level: 'WARN',
        message: expect.stringContaining('does not have an approvedDate'),
      }),
    );
    expect(aiCallRepo.save).not.toHaveBeenCalled();
  });

  it('allows startCall even when approvedDate is earlier than today and forces minSlotDate to tomorrow', async () => {
    const pastDate = dayjs().subtract(5, 'day').toDate();
    const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');

    assignmentRepo.findOne.mockResolvedValue({
      id: 'assign-1',
      approvedDate: pastDate,
      scheduleCount: 1,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    });

    slotRepo._qb.getMany.mockResolvedValue([
      { id: 'slot-future', date: tomorrowStr, startTime: '10:00 AM', endTime: '10:30 AM', status: 1 },
    ]);

    const res = await service.startCall({ ...baseDto });

    expect(res.success).toBe(true);
    expect(res.slot?.id).toBe('slot-future');
    expect(slotRepo._qb.andWhere).toHaveBeenCalledWith('slot.date >= :minSlotDate', {
      minSlotDate: tomorrowStr,
    });
    expect(aiCallLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'CALL_INITIATED',
        level: 'INFO',
      }),
    );
  });

  it('selects earliest chronological slot strictly after today and logs CALL_INITIATED with callReason', async () => {
    const today = dayjs().toDate();
    const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');

    assignmentRepo.findOne.mockResolvedValue({
      id: 'assign-1',
      approvedDate: today,
      scheduleCount: 0,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    });

    // Deliberately return 01:00 PM before 09:00 AM to verify chronological sorting
    slotRepo._qb.getMany.mockResolvedValue([
      { id: 'slot-pm', date: tomorrowStr, startTime: '01:00 PM', endTime: '01:30 PM', status: 1 },
      { id: 'slot-am', date: tomorrowStr, startTime: '09:00 AM', endTime: '09:30 AM', status: 1 },
    ]);

    const res = await service.startCall({ ...baseDto });

    expect(res.success).toBe(true);
    expect(res.slot?.id).toBe('slot-am');
    expect(res.slot?.startTime).toBe('09:00 AM');
    expect(res.callReason).toContain('slot-am');
    expect(slotRepo._qb.andWhere).toHaveBeenCalledWith('slot.date >= :minSlotDate', {
      minSlotDate: tomorrowStr,
    });
    expect(aiCallLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'CALL_INITIATED',
        level: 'INFO',
      }),
    );
  });

  it('logs CALL_BLOCKED and throws NotFoundException when no slot exists after today', async () => {
    assignmentRepo.findOne.mockResolvedValue({
      id: 'assign-1',
      approvedDate: dayjs().toDate(),
      scheduleCount: 1,
      scheduleUnit: 1,
      assignedPhysicianId: 'phys-1',
    });
    slotRepo._qb.getMany.mockResolvedValue([]);

    await expect(service.startCall({ ...baseDto })).rejects.toThrow(NotFoundException);
    expect(aiCallLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'CALL_BLOCKED',
        level: 'WARN',
      }),
    );
  });
});
