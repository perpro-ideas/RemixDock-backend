import { CreditHistoryResponseDto } from './credit-history-response.dto';

export class CreditBalanceResponseDto {
  balance: number;
  lastUpdated: Date | null;
  history: CreditHistoryResponseDto[];
}
