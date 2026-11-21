import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { PatientsService } from '../../patients/patients.service';

export function createVerifyPatientTool(patientsService: PatientsService): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'verifyPatient',
    description:
      'Verify that the person on the phone is the correct patient by matching their phone number and patient ID. Always call this before revealing any appointment details.',
    schema: z.object({
      phoneNumber: z.string().describe('The phone number to verify'),
      patientId: z.string().describe('The patient ID to verify'),
    }),
    func: async ({ phoneNumber, patientId }: { phoneNumber: string; patientId: string }) => {
      try {
        const result = await patientsService.verifyPatient(phoneNumber, patientId);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ verified: false, reason: 'Verification service error' });
      }
    },
  });
}
