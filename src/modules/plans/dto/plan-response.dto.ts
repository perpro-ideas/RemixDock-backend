import { Plan, PlanType } from '@prisma/client';

export class PlanResponseDto {
  id: string;
  name: string;
  description: string | null;
  type: PlanType;
  price: number;
  durationDays: number;
  creditsIncluded: number;
  benefits: string[];
  canRequestRemix: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(plan: Plan): PlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      type: plan.type,
      price: Number(plan.price),
      durationDays: plan.durationDays,
      creditsIncluded: plan.creditsIncluded,
      benefits: Array.isArray(plan.benefitsJson)
        ? (plan.benefitsJson as string[])
        : [],
      canRequestRemix: plan.canRequestRemix,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }
}
