import {
  FundingType,
  Genre,
  RemixRequest,
  RemixRequestStatus,
  Track,
  User,
} from '@prisma/client';

export class RequestUserSummaryDto {
  id: string;
  username: string;
}

export class RequestGenreSummaryDto {
  id: string;
  name: string;
  slug: string;
}

export class RequestTrackSummaryDto {
  id: string;
  title: string;
  artist: string;
  previewAudioUrl: string;
}

export class RemixRequestResponseDto {
  id: string;
  userId: string;
  user: RequestUserSummaryDto;
  remixerId: string | null;
  remixer: RequestUserSummaryDto | null;
  trackId: string | null;
  deliveredTrack: RequestTrackSummaryDto | null;
  genreId: string | null;
  genre: RequestGenreSummaryDto | null;
  title: string;
  artist: string;
  referenceUrl: string | null;
  desiredBpm: number | null;
  notes: string | null;
  fundingType: FundingType;
  bountyCredits: number;
  status: RemixRequestStatus;
  adminFeedback: string | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(
    req: RemixRequest & {
      user: Pick<User, 'id' | 'username'>;
      remixer?: Pick<User, 'id' | 'username'> | null;
      deliveredTrack?: Pick<Track, 'id' | 'title' | 'artist' | 'previewAudioUrl'> | null;
      genre?: Pick<Genre, 'id' | 'name' | 'slug'> | null;
    },
  ): RemixRequestResponseDto {
    return {
      id: req.id,
      userId: req.userId,
      user: {
        id: req.user.id,
        username: req.user.username,
      },
      remixerId: req.remixerId,
      remixer: req.remixer
        ? {
            id: req.remixer.id,
            username: req.remixer.username,
          }
        : null,
      trackId: req.trackId,
      deliveredTrack: req.deliveredTrack
        ? {
            id: req.deliveredTrack.id,
            title: req.deliveredTrack.title,
            artist: req.deliveredTrack.artist,
            previewAudioUrl: req.deliveredTrack.previewAudioUrl,
          }
        : null,
      genreId: req.genreId,
      genre: req.genre
        ? {
            id: req.genre.id,
            name: req.genre.name,
            slug: req.genre.slug,
          }
        : null,
      title: req.title,
      artist: req.artist,
      referenceUrl: req.referenceUrl,
      desiredBpm: req.desiredBpm,
      notes: req.notes,
      fundingType: req.fundingType,
      bountyCredits: req.bountyCredits,
      status: req.status,
      adminFeedback: req.adminFeedback,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
    };
  }
}

export interface PaginatedRemixRequestsResult {
  items: RemixRequestResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
