import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateTrackDto } from './dto/create-track.dto';
import { QueryTracksDto } from './dto/query-tracks.dto';
import { TrackResponseDto } from './dto/track-response.dto';
import { UpdateTrackDto } from './dto/update-track.dto';

export interface PaginatedTracksResult {
  items: TrackResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryTracksDto): Promise<PaginatedTracksResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TrackWhereInput = {
      isPublished: true,
    };

    if (query.genreSlug) {
      where.genre = {
        slug: query.genreSlug,
      };
    }

    if (query.minBpm !== undefined || query.maxBpm !== undefined) {
      where.bpm = {};
      if (query.minBpm !== undefined) {
        where.bpm.gte = query.minBpm;
      }
      if (query.maxBpm !== undefined) {
        where.bpm.lte = query.maxBpm;
      }
    }

    if (query.musicalKey) {
      where.musicalKey = query.musicalKey;
    }

    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { artist: { contains: searchTerm, mode: 'insensitive' } },
        { remixer: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [total, tracks] = await Promise.all([
      this.prisma.track.count({ where }),
      this.prisma.track.findMany({
        where,
        include: {
          genre: true,
          _count: { select: { stems: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: tracks.map((t) => TrackResponseDto.fromEntity(t)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(id: string): Promise<TrackResponseDto> {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: {
        genre: true,
        stems: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!track || !track.isPublished) {
      throw new NotFoundException('La pista solicitada no está disponible');
    }

    return TrackResponseDto.fromEntity(track);
  }

  async findAdminById(id: string): Promise<TrackResponseDto> {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: {
        genre: true,
        stems: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!track) {
      throw new NotFoundException('La pista solicitada no existe');
    }

    return TrackResponseDto.fromEntity(track);
  }

  async create(dto: CreateTrackDto): Promise<TrackResponseDto> {
    const genre = await this.prisma.genre.findUnique({
      where: { id: dto.genreId },
    });

    if (!genre) {
      throw new BadRequestException('El género especificado no existe');
    }

    const track = await this.prisma.track.create({
      data: {
        title: dto.title,
        artist: dto.artist,
        remixer: dto.remixer,
        version: dto.version,
        genreId: dto.genreId,
        bpm: dto.bpm,
        musicalKey: dto.musicalKey,
        durationSeconds: dto.durationSeconds,
        previewAudioUrl: dto.previewAudioUrl,
        downloadAudioUrl: dto.downloadAudioUrl,
        coverImageUrl: dto.coverImageUrl,
        waveformJson: dto.waveformJson as Prisma.InputJsonValue | undefined,
        creditCost: dto.creditCost ?? 1,
        isPublished: dto.isPublished ?? true,
        stems:
          dto.stems && dto.stems.length > 0
            ? {
                create: dto.stems.map((stem) => ({
                  name: stem.name,
                  type: stem.type,
                  audioUrl: stem.audioUrl,
                  creditCost: stem.creditCost ?? 1,
                })),
              }
            : undefined,
      },
      include: {
        genre: true,
        stems: true,
      },
    });

    return TrackResponseDto.fromEntity(track);
  }

  async update(id: string, dto: UpdateTrackDto): Promise<TrackResponseDto> {
    const existing = await this.prisma.track.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('La pista solicitada no existe');
    }

    if (dto.genreId) {
      const genre = await this.prisma.genre.findUnique({
        where: { id: dto.genreId },
      });
      if (!genre) {
        throw new BadRequestException('El género especificado no existe');
      }
    }

    const updated = await this.prisma.track.update({
      where: { id },
      data: {
        title: dto.title,
        artist: dto.artist,
        remixer: dto.remixer,
        version: dto.version,
        genreId: dto.genreId,
        bpm: dto.bpm,
        musicalKey: dto.musicalKey,
        durationSeconds: dto.durationSeconds,
        previewAudioUrl: dto.previewAudioUrl,
        downloadAudioUrl: dto.downloadAudioUrl,
        coverImageUrl: dto.coverImageUrl,
        waveformJson:
          dto.waveformJson !== undefined
            ? (dto.waveformJson as Prisma.InputJsonValue)
            : undefined,
        creditCost: dto.creditCost,
        isPublished: dto.isPublished,
      },
      include: {
        genre: true,
        stems: true,
      },
    });

    return TrackResponseDto.fromEntity(updated);
  }
}
