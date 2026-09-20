import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreditEntryType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CreditsService } from '../../credits/credits.service';
import { OrderResponseDto } from '../dto/order-response.dto';
import { PaypalWebhookEvent } from '../dto/paypal-webhook.dto';
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

export interface WebhookProcessResult {
  received: boolean;
  processed: boolean;
  message?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

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

  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    event: PaypalWebhookEvent,
  ): Promise<WebhookProcessResult> {
    const isValid = await this.paypalService.verifyWebhookSignature(headers, event);
    if (!isValid) {
      throw new BadRequestException('Firma de webhook inválida');
    }

    this.logger.log(`Webhook de PayPal recibido: tipo ${event.event_type}, ID ${event.id}`);

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      return this.handlePaymentCaptureCompleted(event);
    }

    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      this.logger.log(`Orden de PayPal aprobada por el cliente: ${event.id}`);
      return { received: true, processed: false, message: 'Evento registrado' };
    }

    this.logger.log(`Evento de webhook omitido o informativo: ${event.event_type}`);
    return { received: true, processed: false, message: 'Evento ignorado' };
  }

  private async handlePaymentCaptureCompleted(
    event: PaypalWebhookEvent,
  ): Promise<WebhookProcessResult> {
    const resource = event.resource || {};
    const customId = (resource.custom_id as string) || undefined;
    const supplementaryData = resource.supplementary_data as
      | { related_ids?: { order_id?: string } }
      | undefined;
    const relatedOrderId = supplementaryData?.related_ids?.order_id;
    const resourceId = resource.id as string | undefined;

    // Buscar orden por custom_id (id interno) o por identificadores de PayPal
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          ...(customId ? [{ id: customId }] : []),
          ...(relatedOrderId ? [{ paypalOrderId: relatedOrderId }] : []),
          ...(resourceId ? [{ paypalOrderId: resourceId }] : []),
        ],
      },
      include: { plan: true },
    });

    if (!order) {
      this.logger.warn(`No se localizó la orden para el evento de captura: ${event.id}`);
      return { received: true, processed: false, message: 'Orden no encontrada' };
    }

    // Idempotencia: si la orden ya está completada, no duplicar créditos
    if (order.status === OrderStatus.COMPLETED) {
      this.logger.log(`Orden ${order.id} ya completada previamente. Evento idempotente.`);
      return { received: true, processed: false, message: 'Orden ya completada previamente' };
    }

    if (order.status === OrderStatus.PENDING) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.COMPLETED,
            paypalOrderId: relatedOrderId || resourceId || order.paypalOrderId,
          },
        });
      });

      if (order.plan.creditsIncluded > 0) {
        await this.creditsService.addEntry(
          order.userId,
          order.plan.creditsIncluded,
          CreditEntryType.PLAN_SUBSCRIPTION,
          `Acreditación por compra de plan: ${order.plan.name}`,
          {
            orderId: order.id,
            planId: order.plan.id,
            webhookEventId: event.id,
          },
        );
      }

      this.logger.log(`Orden ${order.id} completada y créditos acreditados exitosamente vía webhook.`);
      return { received: true, processed: true, message: 'Orden completada y créditos acreditados' };
    }

    return { received: true, processed: false, message: 'Estado de orden no procesable' };
  }
}
