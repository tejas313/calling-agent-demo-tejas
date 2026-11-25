import { Injectable, Logger } from '@nestjs/common';
import { PhysiciansService } from '../physicians/physicians.service';
import { Physician } from '../physicians/entities/physician.entity';
import { ClinicalPriority } from '../common/constants';

export interface DistributionResult {
  assignedPhysicianId: string;
  physicianName: string;
  specialty: string;
  workloadScore: number;
  distributionRationale: string;
}

@Injectable()
export class ReferralDistributionService {
  private readonly logger = new Logger(ReferralDistributionService.name);

  constructor(private readonly physiciansService: PhysiciansService) {}

  /**
   * Distributes a referral to the best available physician based on:
   * 1. Specialty match
   * 2. Current workload (active referrals count + daily quota)
   * 3. Urgency / priority balancing
   */
  async distributeReferral(
    specialtyRequired: string,
    priority: ClinicalPriority,
  ): Promise<DistributionResult> {
    this.logger.log(
      `Running AI referral distribution for specialty="${specialtyRequired}", priority=${priority}`,
    );

    // 1. Find physicians matching specialty
    let matchingPhysicians = await this.physiciansService.findBySpecialty(specialtyRequired);

    // Fallback: if no exact specialty match, get all physicians
    if (matchingPhysicians.length === 0) {
      this.logger.warn(`No exact physician match for "${specialtyRequired}". Checking general practitioners...`);
      matchingPhysicians = await this.physiciansService.findAll();
    }

    if (matchingPhysicians.length === 0) {
      throw new Error('No physicians available in the system for referral distribution');
    }

    // 2. Score physicians based on workload capacity
    // Lower score is better (less loaded)
    const scoredPhysicians = matchingPhysicians.map((physician) => {
      const activeReferrals = physician.activeReferralsCount || 0;
      const maxCapacity = physician.maxDailyAppointments || 20;

      // Workload index: percentage of capacity utilized
      const utilizationRatio = activeReferrals / maxCapacity;

      // Urgency factor: for RED_STAR / URGENT, prioritize doctors with lower utilization
      const urgencyMultiplier =
        priority === ClinicalPriority.RED_STAR
          ? 2.0
          : priority === ClinicalPriority.URGENT
            ? 1.5
            : 1.0;

      const workloadScore = Number((utilizationRatio * urgencyMultiplier * 10).toFixed(2));

      return {
        physician,
        workloadScore,
        activeReferrals,
        maxCapacity,
      };
    });

    // Sort by lowest workload score
    scoredPhysicians.sort((a, b) => a.workloadScore - b.workloadScore);

    const chosen = scoredPhysicians[0];
    const rationale = `Assigned to ${chosen.physician.name} (${chosen.physician.specialty}) based on lowest workload score of ${chosen.workloadScore} (${chosen.activeReferrals} active referrals / ${chosen.maxCapacity} daily capacity) with priority ${priority}.`;

    this.logger.log(`[Distribution Complete] ${rationale}`);

    // Increment physician referral count
    await this.physiciansService.incrementReferrals(chosen.physician.id);

    return {
      assignedPhysicianId: chosen.physician.id,
      physicianName: chosen.physician.name,
      specialty: chosen.physician.specialty,
      workloadScore: chosen.workloadScore,
      distributionRationale: rationale,
    };
  }
}

