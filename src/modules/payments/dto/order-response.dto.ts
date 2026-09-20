import { Order, OrderStatus, Plan } from '@prisma/client';

export class OrderResponseDto {
  id: string;
  userId: string;
  planId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paypalOrderId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  plan?: {
    name: string;
    creditsIncluded: number;
  };

  static fromEntity(order: Order & { plan?: Plan | null }): OrderResponseDto {
    return {
      id: order.id,
      userId: order.userId,
      planId: order.planId,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      paypalOrderId: order.paypalOrderId,
      metadata: order.metadataJson as Record<string, unknown> | null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      plan: order.plan
        ? {
            name: order.plan.name,
            creditsIncluded: order.plan.creditsIncluded,
          }
        : undefined,
    };
  }
}
