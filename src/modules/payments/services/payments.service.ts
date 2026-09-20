import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditEntryType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CreditsService } from '../../credits/credits.service';
import { OrderResponseDto } from '../dto/order-response.dto';
import { PaypalService } from './paypal.service';

export interface CreateOrderResult {
  orderId: string;
  paypalOrderId: string;
  approvalUrl: string;
  amount: number;
  currency: string;
}

export interface CaptureOrderResult {
  message: string;
  alreadyCompleted?: boolean;
  order: OrderResponseDto;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paypalService: PaypalService,
    private readonly creditsService: CreditsService,
  ) {}

  async createOrder(userId: string, planId: string): Promise<CreateOrderResult> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.isActive) {
      throw new NotFoundException('El plan solicitado no existe o no se encuentra activo');
    }

    const order = await this.prisma.order.create({
      data: {
        userId,
        planId: plan.id,
        amount: plan.price,
        currency: 'USD',
        status: OrderStatus.PENDING,
        metadataJson: {
          planName: plan.name,
          creditsIncluded: plan.creditsIncluded,
        },
      },
    });

    const paypalOrder = await this.paypalService.createOrder(
      Number(plan.price),
      'USD',
      order.id,
    );

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paypalOrderId: paypalOrder.paypalOrderId,
      },
    });

    return {
      orderId: order.id,
      paypalOrderId: paypalOrder.paypalOrderId,
      approvalUrl: paypalOrder.approvalUrl,
      amount: Number(plan.price),
      currency: 'USD',
    };
  }

  async captureOrder(
    userId: string,
    orderId: string,
    paypalOrderId: string,
  ): Promise<CaptureOrderResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { plan: true },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('La orden no existe o no pertenece al usuario autenticado');
    }

    // Idempotencia: si la orden ya está completada, retornamos sin duplicar créditos
    if (order.status === OrderStatus.COMPLETED) {
      return {
        message: 'La orden ya ha sido completada previamente',
        alreadyCompleted: true,
        order: OrderResponseDto.fromEntity(order),
      };
    }

    if (order.status === OrderStatus.FAILED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException('La orden no se encuentra en un estado procesable');
    }

    const captureResult = await this.paypalService.captureOrder(paypalOrderId);

    if (captureResult.status !== 'COMPLETED') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED },
      });
      throw new BadRequestException('El pago no pudo ser confirmado por la pasarela');
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const completed = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          paypalOrderId,
        },
        include: { plan: true },
      });

      return completed;
    });

    // Acreditación contable en el ledger inmutable
    if (order.plan.creditsIncluded > 0) {
      await this.creditsService.addEntry(
        userId,
        order.plan.creditsIncluded,
        CreditEntryType.PLAN_SUBSCRIPTION,
        `Acreditación por compra de plan: ${order.plan.name}`,
        {
          orderId: order.id,
          planId: order.plan.id,
          paypalOrderId,
        },
      );
    }

    return {
      message: 'Orden procesada y créditos acreditados exitosamente',
      order: OrderResponseDto.fromEntity(updatedOrder),
    };
  }
}
