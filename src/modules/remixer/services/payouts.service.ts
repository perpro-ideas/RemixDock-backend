import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayoutStatus,
  Prisma,
  RemixerEarningType,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CreatePayoutRequestDto } from '../dto/create-payout-request.dto';
import { PayoutResponseDto } from '../dto/payout-response.dto';
import { QueryPayoutsDto } from '../dto/query-payouts.dto';
import { UpdatePayoutStatusDto } from '../dto/update-payout-status.dto';
import { RemixerEarningsService } from './remixer-earnings.service';

export interface PaginatedPayoutsResponse {
  items: PayoutResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly earningsService: RemixerEarningsService,
  ) {}

  async createPayoutRequest(
    userId: string,
    dto: CreatePayoutRequestDto,
  ): Promise<PayoutResponseDto> {
    if (dto.creditsAmount < 20) {
      throw new BadRequestException(
        'El retiro mínimo permitido es de 20 créditos ($20.00 USD)',
      );
    }

    const availableBalance = await this.earningsService.getAvailableBalance(userId);

    if (availableBalance < dto.creditsAmount) {
      throw new BadRequestException(
        'Saldo de ganancias insuficiente para solicitar este retiro',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.create({
        data: {
          remixerId: userId,
          creditsAmount: new Prisma.Decimal(dto.creditsAmount),
          amountFiat: new Prisma.Decimal(dto.creditsAmount),
          currency: 'USD',
          status: PayoutStatus.PENDING,
          method: dto.method,
          destinationDetails: dto.destinationDetails as Prisma.InputJsonValue,
        },
        include: {
          remixer: {
            select: { id: true, username: true, email: true },
          },
        },
      });

      // Congelamiento inmediato del saldo contable solicitado
      await tx.remixerEarning.create({
        data: {
          remixerId: userId,
          amountCredits: new Prisma.Decimal(-dto.creditsAmount),
          type: RemixerEarningType.PAYOUT_DEDUCTION,
          payoutRequestId: payout.id,
          description: `Retiro de fondos solicitado (${payout.method})`,
        },
      });

      return payout;
    });

    return PayoutResponseDto.fromEntity(created);
  }

  async getRemixerPayouts(
    userId: string,
    query: QueryPayoutsDto,
  ): Promise<PaginatedPayoutsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PayoutRequestWhereInput = {
      remixerId: userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payoutRequest.count({ where }),
    ]);

    return {
      items: items.map((item) => PayoutResponseDto.fromEntity(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRemixerPayoutById(
    userId: string,
    id: string,
  ): Promise<PayoutResponseDto> {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id },
      include: {
        remixer: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    if (!payout || payout.remixerId !== userId) {
      throw new NotFoundException('La solicitud de retiro no existe');
    }

    return PayoutResponseDto.fromEntity(payout);
  }

  async getAdminPayouts(
    query: QueryPayoutsDto,
  ): Promise<PaginatedPayoutsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PayoutRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.remixerId ? { remixerId: query.remixerId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where,
        include: {
          remixer: {
            select: { id: true, username: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payoutRequest.count({ where }),
    ]);

    return {
      items: items.map((item) => PayoutResponseDto.fromEntity(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminPayoutById(id: string): Promise<PayoutResponseDto> {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id },
      include: {
        remixer: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    if (!payout) {
      throw new NotFoundException('La solicitud de retiro no existe');
    }

    return PayoutResponseDto.fromEntity(payout);
  }

  async updatePayoutStatus(
    id: string,
    dto: UpdatePayoutStatusDto,
  ): Promise<PayoutResponseDto> {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id },
    });

    if (!payout) {
      throw new NotFoundException('La solicitud de retiro no existe');
    }

    if (
      payout.status === PayoutStatus.COMPLETED ||
      payout.status === PayoutStatus.REJECTED ||
      payout.status === PayoutStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede modificar una solicitud de retiro que ya ha sido finalizada o rechazada',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const isRejection = dto.status === PayoutStatus.REJECTED;
      const isCompleted = dto.status === PayoutStatus.COMPLETED;

      const result = await tx.payoutRequest.update({
        where: { id },
        data: {
          status: dto.status,
          adminFeedback: dto.adminFeedback ?? payout.adminFeedback,
          ...(isCompleted || isRejection ? { processedAt: new Date() } : {}),
        },
        include: {
          remixer: {
            select: { id: true, username: true, email: true },
          },
        },
      });

      // Si se rechaza, restituir el saldo retenido de forma inmediata
      if (isRejection) {
        await tx.remixerEarning.create({
          data: {
            remixerId: payout.remixerId,
            amountCredits: payout.creditsAmount,
            type: RemixerEarningType.PAYOUT_REFUND,
            payoutRequestId: payout.id,
            description: dto.adminFeedback
              ? `Reembolso de retiro rechazado: ${dto.adminFeedback}`
              : 'Reembolso por solicitud de retiro rechazada',
          },
        });
      }

      return result;
    });

    return PayoutResponseDto.fromEntity(updated);
  }
}
