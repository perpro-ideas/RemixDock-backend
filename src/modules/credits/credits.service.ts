import { BadRequestException, Injectable } from '@nestjs/common';
import { CreditEntryType, CreditLedgerEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreditBalanceResponseDto } from './dto/credit-balance-response.dto';
import { CreditHistoryResponseDto } from './dto/credit-history-response.dto';

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    const aggregate = await client.creditLedgerEntry.aggregate({
      where: { userId },
      _sum: { amount: true },
    });

    return aggregate._sum.amount ?? 0;
  }

  async addEntry(
    userId: string,
    amount: number,
    type: CreditEntryType,
    description: string,
    metadata?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditLedgerEntry> {
    if (amount === 0) {
      throw new BadRequestException('El monto del movimiento no puede ser cero');
    }

    const client = tx ?? this.prisma;

    if (amount < 0) {
      const currentBalance = await this.getBalance(userId, client);
      if (currentBalance + amount < 0) {
        throw new BadRequestException('Créditos insuficientes para realizar esta acción');
      }
    }

    return client.creditLedgerEntry.create({
      data: {
        userId,
        amount,
        type,
        description,
        metadataJson: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async getHistory(userId: string, limit = 20): Promise<CreditLedgerEntry[]> {
    return this.prisma.creditLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getCreditBalanceSummary(
    userId: string,
    limit = 20,
  ): Promise<CreditBalanceResponseDto> {
    const [balance, entries] = await Promise.all([
      this.getBalance(userId),
      this.getHistory(userId, limit),
    ]);

    const lastUpdated = entries.length > 0 ? entries[0].createdAt : null;
    const history = entries.map((entry) => CreditHistoryResponseDto.fromEntity(entry));

    return {
      balance,
      lastUpdated,
      history,
    };
  }
}
