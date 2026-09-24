import { RemixerEarningResponseDto } from './remixer-earning-response.dto';

export class StudioDashboardResponseDto {
  totalEarnedCredits: number;
  totalEarnedFiat: number;
  availableBalanceCredits: number;
  availableBalanceFiat: number;
  pendingPayoutCredits: number;
  pendingPayoutFiat: number;
  activeTracksCount: number;
  assignedRequestsCount: number;
  recentEarnings: RemixerEarningResponseDto[];
}
