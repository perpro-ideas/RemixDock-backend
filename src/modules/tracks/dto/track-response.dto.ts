import { Genre, Stem, StemType, Track } from '@prisma/client';

export class StemResponseDto {
  id: string;
  name: string;
  type: StemType;
  audioUrl: string;
  creditCost: number;
  createdAt: Date;

  static fromEntity(stem: Stem): StemResponseDto {
    return {
      id: stem.id,
      name: stem.name,
      type: stem.type,
      audioUrl: stem.audioUrl,
      creditCost: stem.creditCost,
      createdAt: stem.createdAt,
    };
  }
}

export class TrackResponseDto {
  id: string;
  title: string;
  artist: string;
  remixer: string | null;
  version: string | null;
  genreId: string;
  genre: {
    id: string;
    name: string;
    slug: string;
  };
  bpm: number;
  musicalKey: string;
  durationSeconds: number;
  previewAudioUrl: string;
  downloadAudioUrl: string;
  coverImageUrl: string | null;
  waveform: unknown;
  creditCost: number;
  isPublished: boolean;
  stemsCount: number;
  stems?: StemResponseDto[];
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(
    track: Track & {
      genre: Genre;
      stems?: Stem[];
      _count?: { stems: number };
    },
  ): TrackResponseDto {
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      remixer: track.remixer,
      version: track.version,
      genreId: track.genreId,
      genre: {
        id: track.genre.id,
        name: track.genre.name,
        slug: track.genre.slug,
      },
      bpm: track.bpm,
      musicalKey: track.musicalKey,
      durationSeconds: track.durationSeconds,
      previewAudioUrl: track.previewAudioUrl,
      downloadAudioUrl: track.downloadAudioUrl,
      coverImageUrl: track.coverImageUrl,
      waveform: track.waveformJson,
      creditCost: track.creditCost,
      isPublished: track.isPublished,
      stemsCount: track._count?.stems ?? (track.stems ? track.stems.length : 0),
      stems: track.stems
        ? track.stems.map((s) => StemResponseDto.fromEntity(s))
        : undefined,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt,
    };
  }
}
