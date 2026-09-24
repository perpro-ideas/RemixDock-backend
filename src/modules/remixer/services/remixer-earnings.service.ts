import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { QueryEarningsDto } from '../dto/query-earnings.dto';
import { RemixerEarningResponseDto } from '../dto/remixer-earning-response.dto';
import { StudioDashboardResponseDto } from '../dto/studio-dashboard-response.dto';

export interface PaginatedEarningsResponse {
  items: RemixerEarningResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class RemixerEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudioDashboard(userId: string): Promise<StudioDashboardResponseDto> {
    const [
      allEarnings,
      activeTracksCount,
      assignedRequestsCount,
      pendingPayouts,
      recentEarnings,
    ] = await Promise.all([
      this.prisma.remixerEarning.findMany({
        where: { remixerId: userId },
      }),
      this.prisma.track.count({
        where: { remixerId: userId, isPublished: true },
      }),
      this.prisma.remixRequest.count({
        where: {
          remixerId: userId,
          status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.payoutRequest.findMany({
        where: {
          remixerId: userId,
          status: { in: ['PENDING', 'IN_REVIEW', 'APPROVED', 'PROCESSING'] },
        },
      }),
      this.prisma.remixerEarning.findMany({
        where: { remixerId: userId },
        include: { track: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const totalEarnedCredits = allEarnings
      .filter((e) => Number(e.amountCredits) > 0 && e.type !== 'PAYOUT_REFUND')
      .reduce((sum, e) => sum + Number(e.amountCredits), 0);

    const availableBalanceCredits = allEarnings.reduce(
      (sum, e) => sum + Number(e.amountCredits),
      0,
    );

    const pendingPayoutCredits = pendingPayouts.reduce(
      (sum, p) => sum + Number(p.creditsAmount),
      0,
    );

    return {
      totalEarnedCredits: Number(totalEarnedCredits.toFixed(2)),
      totalEarnedFiat: Number(totalEarnedCredits.toFixed(2)),
      availableBalanceCredits: Number(availableBalanceCredits.toFixed(2)),
      availableBalanceFiat: Number(availableBalanceCredits.toFixed(2)),
      pendingPayoutCredits: Number(pendingPayoutCredits.toFixed(2)),
      pendingPayoutFiat: Number(pendingPayoutCredits.toFixed(2)),
      activeTracksCount,
      assignedRequestsCount,
      recentEarnings: recentEarnings.map((e) =>
        RemixerEarningResponseDto.fromEntity(e),
      ),
    };
  }

  async getEarnings(
    userId: string,
    query: QueryEarningsDto,
  ): Promise<PaginatedEarningsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RemixerEarningWhereInput = {
      remixerId: userId,
      ...(query.type ? { type: query.type } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.remixerEarning.findMany({
        where,
        include: { track: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.remixerEarning.count({ where }),
    ]);

    return {
      items: items.map((item) => RemixerEarningResponseDto.fromEntity(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAvailableBalance(userId: string): Promise<number> {
    const aggregate = await this.prisma.remixerEarning.aggregate({
      where: { remixerId: userId },
      _sum: { amountCredits: true },
    });

    const sum = aggregate._sum.amountCredits;
    return sum ? Number(sum) : 0;
  }
}
