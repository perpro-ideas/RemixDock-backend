import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreditEntryType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { DownloadResponseDto } from './dto/download-response.dto';
import { LibraryItemResponseDto } from './dto/library-item-response.dto';

@Injectable()
export class DownloadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
  ) {}

  async downloadTrack(userId: string, trackId: string): Promise<DownloadResponseDto> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track || !track.isPublished) {
      throw new NotFoundException('La pista no existe o no está disponible para descarga');
    }

    // Regla de Re-descarga Gratuita (REM-113)
    const existingDownload = await this.prisma.download.findFirst({
      where: {
        userId,
        trackId,
        stemId: null,
      },
    });

    if (existingDownload) {
      return {
        downloadUrl: track.downloadAudioUrl,
        costCredits: 0,
        isRedownload: true,
        message: 'Pista previamente adquirida. Re-descarga sin costo.',
      };
    }

    // Primera Adquisición (REM-106)
    const currentBalance = await this.creditsService.getBalance(userId);
    if (currentBalance < track.creditCost) {
      throw new BadRequestException('Saldo de créditos insuficiente para realizar esta descarga');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.creditsService.addEntry(
        userId,
        -track.creditCost,
        CreditEntryType.REMIX_DOWNLOAD,
        `Descarga de pista: ${track.title}`,
        { trackId: track.id },
        tx,
      );

      await tx.download.create({
        data: {
          userId,
          trackId: track.id,
          costCredits: track.creditCost,
        },
      });
    });

    return {
      downloadUrl: track.downloadAudioUrl,
      costCredits: track.creditCost,
      isRedownload: false,
      message: 'Descarga autorizada y créditos debitados.',
    };
  }

  async downloadStem(userId: string, stemId: string): Promise<DownloadResponseDto> {
    const stem = await this.prisma.stem.findUnique({
      where: { id: stemId },
      include: { track: true },
    });

    if (!stem || !stem.track || !stem.track.isPublished) {
      throw new NotFoundException('El stem no existe o no está disponible para descarga');
    }

    // Regla de Re-descarga Gratuita (REM-113)
    const existingDownload = await this.prisma.download.findFirst({
      where: {
        userId,
        stemId,
      },
    });

    if (existingDownload) {
      return {
        downloadUrl: stem.audioUrl,
        costCredits: 0,
        isRedownload: true,
        message: 'Stem previamente adquirido. Re-descarga sin costo.',
      };
    }

    // Primera Adquisición (REM-106)
    const currentBalance = await this.creditsService.getBalance(userId);
    if (currentBalance < stem.creditCost) {
      throw new BadRequestException('Saldo de créditos insuficiente para realizar esta descarga');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.creditsService.addEntry(
        userId,
        -stem.creditCost,
        CreditEntryType.REMIX_DOWNLOAD,
        `Descarga de stem: ${stem.name} (${stem.track.title})`,
        { stemId: stem.id, trackId: stem.trackId },
        tx,
      );

      await tx.download.create({
        data: {
          userId,
          stemId: stem.id,
          trackId: stem.trackId,
          costCredits: stem.creditCost,
        },
      });
    });

    return {
      downloadUrl: stem.audioUrl,
      costCredits: stem.creditCost,
      isRedownload: false,
      message: 'Descarga autorizada y créditos debitados.',
    };
  }

  async getUserLibrary(userId: string): Promise<LibraryItemResponseDto[]> {
    const downloads = await this.prisma.download.findMany({
      where: { userId },
      include: {
        track: {
          include: { genre: true },
        },
        stem: {
          include: {
            track: {
              include: { genre: true },
            },
          },
        },
      },
      orderBy: { downloadedAt: 'desc' },
    });

    return downloads.map((download) => LibraryItemResponseDto.fromEntity(download));
  }
}
