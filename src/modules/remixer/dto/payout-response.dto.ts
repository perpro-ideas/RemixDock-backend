import { PayoutMethod, PayoutRequest, PayoutStatus, User } from '@prisma/client';

export interface PayoutRemixerInfo {
  id: string;
  username: string;
  email: string;
}

export class PayoutResponseDto {
  id: string;
  remixerId: string;
  creditsAmount: number;
  amountFiat: number;
  currency: string;
  status: PayoutStatus;
  method: PayoutMethod;
  destinationDetails: Record<string, unknown>;
  adminFeedback?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  remixer?: PayoutRemixerInfo | null;

  static fromEntity(
    payout: PayoutRequest & { remixer?: Partial<User> | null },
  ): PayoutResponseDto {
    return {
      id: payout.id,
      remixerId: payout.remixerId,
      creditsAmount: Number(payout.creditsAmount),
      amountFiat: Number(payout.amountFiat),
      currency: payout.currency,
      status: payout.status,
      method: payout.method,
      destinationDetails: (payout.destinationDetails as Record<string, unknown>) ?? {},
      adminFeedback: payout.adminFeedback,
      processedAt: payout.processedAt?.toISOString() ?? null,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
      remixer: payout.remixer
        ? {
            id: payout.remixer.id!,
            username: payout.remixer.username!,
            email: payout.remixer.email!,
          }
        : null,
    };
  }
}
