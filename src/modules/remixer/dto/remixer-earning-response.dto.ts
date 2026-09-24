import { RemixerEarning, RemixerEarningType, Track } from '@prisma/client';

export interface EarningTrackInfo {
  id: string;
  title: string;
  artist: string;
  version?: string | null;
}

export class RemixerEarningResponseDto {
  id: string;
  remixerId: string;
  amountCredits: number;
  type: RemixerEarningType;
  trackId?: string | null;
  requestId?: string | null;
  payoutRequestId?: string | null;
  description: string;
  createdAt: string;
  track?: EarningTrackInfo | null;

  static fromEntity(
    earning: RemixerEarning & { track?: Partial<Track> | null },
  ): RemixerEarningResponseDto {
    return {
      id: earning.id,
      remixerId: earning.remixerId,
      amountCredits: Number(earning.amountCredits),
      type: earning.type,
      trackId: earning.trackId,
      requestId: earning.requestId,
      payoutRequestId: earning.payoutRequestId,
      description: earning.description,
      createdAt: earning.createdAt.toISOString(),
      track: earning.track
        ? {
            id: earning.track.id!,
            title: earning.track.title!,
            artist: earning.track.artist!,
            version: earning.track.version,
          }
        : null,
    };
  }
}
