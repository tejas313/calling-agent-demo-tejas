"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createVerifyPatientTool", {
    enumerable: true,
    get: function() {
        return createVerifyPatientTool;
    }
});
const _tools = require("@langchain/core/tools");
const _zod = require("zod");
function createVerifyPatientTool(patientsService) {
    return new _tools.DynamicStructuredTool({
        name: 'verifyPatient',
        description: 'Verify that the person on the phone is the correct patient by matching their phone number and patient ID. Always call this before revealing any appointment details.',
        schema: _zod.z.object({
            phoneNumber: _zod.z.string().describe('The phone number to verify'),
            patientId: _zod.z.string().describe('The patient ID to verify')
        }),
        func: async ({ phoneNumber, patientId })=>{
            try {
                const result = await patientsService.verifyPatient(phoneNumber, patientId);
                return JSON.stringify(result);
            } catch (error) {
                return JSON.stringify({
                    verified: false,
                    reason: 'Verification service error'
                });
            }
        }
    });
}

//# sourceMappingURL=verify-patient.tool.js.map