import { CreditEntryType, CreditLedgerEntry } from '@prisma/client';

export class CreditHistoryResponseDto {
  id: string;
  amount: number;
  type: CreditEntryType;
  description: string;
  metadataJson?: Record<string, unknown> | null;
  createdAt: Date;

  static fromEntity(entry: CreditLedgerEntry): CreditHistoryResponseDto {
    return {
      id: entry.id,
      amount: entry.amount,
      type: entry.type,
      description: entry.description,
      metadataJson: entry.metadataJson as Record<string, unknown> | null,
      createdAt: entry.createdAt,
    };
  }
}
