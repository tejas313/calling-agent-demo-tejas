import { createVerifyPatientTool } from '../../../src/langchain/tools/verify-patient.tool';
import { PatientsService } from '../../../src/patients/patients.service';

describe('VerifyPatientTool', () => {
  let tool: any;
  let mockPatientsService: Partial<jest.Mocked<PatientsService>>;

  beforeEach(() => {
    mockPatientsService = {
      verifyPatient: jest.fn(),
    };
    tool = createVerifyPatientTool(mockPatientsService as unknown as PatientsService);
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('verifyPatient');
  });

  it('should have schema with phoneNumber and patientId', () => {
    const shape = tool.schema.shape;
    expect(shape).toHaveProperty('phoneNumber');
    expect(shape).toHaveProperty('patientId');
  });

  it('should return verified=true JSON when patient is verified', async () => {
    const verifyResult = { verified: true, patientId: 'PAT-001', patientName: 'John Smith' };
    (mockPatientsService.verifyPatient as jest.Mock).mockResolvedValue(verifyResult);

    const result = await tool.func({ phoneNumber: '+14165551001', patientId: 'PAT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.verified).toBe(true);
    expect(parsed.patientId).toBe('PAT-001');
    expect(parsed.patientName).toBe('John Smith');
  });

  it('should return verified=false JSON when phone does not match', async () => {
    const verifyResult = { verified: false, reason: 'Phone number does not match our records' };
    (mockPatientsService.verifyPatient as jest.Mock).mockResolvedValue(verifyResult);

    const result = await tool.func({ phoneNumber: '+14165559999', patientId: 'PAT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.verified).toBe(false);
    expect(parsed.reason).toContain('Phone number');
  });

  it('should return verified=false JSON when patient not found', async () => {
    const verifyResult = { verified: false, reason: 'Patient not found' };
    (mockPatientsService.verifyPatient as jest.Mock).mockResolvedValue(verifyResult);

    const result = await tool.func({ phoneNumber: '+14165551001', patientId: 'INVALID' });
    const parsed = JSON.parse(result);

    expect(parsed.verified).toBe(false);
  });

  it('should return error JSON when service throws', async () => {
    (mockPatientsService.verifyPatient as jest.Mock).mockRejectedValue(new Error('DB Error'));

    const result = await tool.func({ phoneNumber: '+14165551001', patientId: 'PAT-001' });
    const parsed = JSON.parse(result);

    expect(parsed.verified).toBe(false);
  });
});
