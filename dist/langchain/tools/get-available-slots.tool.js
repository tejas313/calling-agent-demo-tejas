"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "createGetAvailableSlotsTool", {
    enumerable: true,
    get: function() {
        return createGetAvailableSlotsTool;
    }
});
const _tools = require("@langchain/core/tools");
const _zod = require("zod");
function createGetAvailableSlotsTool(appointmentsService) {
    return new _tools.DynamicStructuredTool({
        name: 'getAvailableSlots',
        description: 'Get available appointment time slots for a physician on a specific date. Use this when the patient wants to reschedule.',
        schema: _zod.z.object({
            physicianId: _zod.z.string(),
            date: _zod.z.string().describe('Date in YYYY-MM-DD format')
        }),
        func: async ({ physicianId, date })=>{
            try {
                const slots = await appointmentsService.getAvailableSlots(physicianId, date);
                return JSON.stringify({
                    availableSlots: slots,
                    count: slots.length
                });
            } catch (error) {
                return JSON.stringify({
                    error: 'Failed to retrieve available slots'
                });
            }
        }
    });
}

//# sourceMappingURL=get-available-slots.tool.js.map