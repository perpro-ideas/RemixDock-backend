import { Download, Genre, Stem, StemType, Track } from '@prisma/client';

export type DownloadType = 'TRACK' | 'STEM';

export class LibraryTrackSummaryDto {
  id: string;
  title: string;
  artist: string;
  remixer: string | null;
  version: string | null;
  genre: {
    id: string;
    name: string;
    slug: string;
  } | null;
  bpm: number;
  musicalKey: string;
  coverImageUrl: string | null;
}

export class LibraryStemSummaryDto {
  id: string;
  name: string;
  type: StemType;
  audioUrl: string;
}

export class LibraryItemResponseDto {
  id: string;
  type: DownloadType;
  costCredits: number;
  downloadUrl: string;
  downloadedAt: Date;
  track: LibraryTrackSummaryDto | null;
  stem: LibraryStemSummaryDto | null;

  static fromEntity(
    download: Download & {
      track: (Track & { genre?: Genre | null }) | null;
      stem: (Stem & { track?: (Track & { genre?: Genre | null }) | null }) | null;
    },
  ): LibraryItemResponseDto {
    const isStem = Boolean(download.stemId && download.stem);
    const type: DownloadType = isStem ? 'STEM' : 'TRACK';

    const effectiveTrack = download.track ?? download.stem?.track ?? null;
    const downloadUrl = isStem
      ? (download.stem?.audioUrl ?? '')
      : (download.track?.downloadAudioUrl ?? '');

    return {
      id: download.id,
      type,
      costCredits: download.costCredits,
      downloadUrl,
      downloadedAt: download.downloadedAt,
      track: effectiveTrack
        ? {
            id: effectiveTrack.id,
            title: effectiveTrack.title,
            artist: effectiveTrack.artist,
            remixer: effectiveTrack.remixer,
            version: effectiveTrack.version,
            genre: effectiveTrack.genre
              ? {
                  id: effectiveTrack.genre.id,
                  name: effectiveTrack.genre.name,
                  slug: effectiveTrack.genre.slug,
                }
              : null,
            bpm: effectiveTrack.bpm,
            musicalKey: effectiveTrack.musicalKey,
            coverImageUrl: effectiveTrack.coverImageUrl,
          }
        : null,
      stem: download.stem
        ? {
            id: download.stem.id,
            name: download.stem.name,
            type: download.stem.type,
            audioUrl: download.stem.audioUrl,
          }
        : null,
    };
  }
}
