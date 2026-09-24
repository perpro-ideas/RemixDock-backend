export class RemixRequestQuotaResponseDto {
  planName: string | null;
  hasSubscription: boolean;
  canRequestRemix: boolean;
  monthlyLimit: number;
  usedThisPeriod: number;
  remaining: number;
  periodEnd?: Date;
}
