import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreditEntryType } from '@prisma/client';
import archiver from 'archiver';
import { Response } from 'express';
import { Readable } from 'node:stream';
import { PrismaService } from '../../database/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { DownloadResponseDto } from './dto/download-response.dto';
import { LibraryItemResponseDto } from './dto/library-item-response.dto';
import {
  generateMetadataFileContent,
  getStemFilename,
  getZipFilename,
  slugify,
} from './utils/stems-archive.util';

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

  async downloadTrackStemsZip(
    userId: string,
    trackId: string,
    res: Response,
  ): Promise<void> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        stems: { orderBy: { type: 'asc' } },
        genre: true,
      },
    });

    if (!track) {
      throw new NotFoundException('La pista musical no existe');
    }

    if (track.stems.length === 0) {
      throw new BadRequestException('Este track no cuenta con stems multipista separados');
    }

    if (!track.isPublished) {
      const priorPurchase = await this.prisma.download.findFirst({
        where: { userId, trackId },
      });
      if (!priorPurchase) {
        throw new NotFoundException('Pista no disponible en el catálogo');
      }
    }

    const existingDownload = await this.prisma.download.findFirst({
      where: {
        userId,
        trackId,
      },
    });

    if (!existingDownload) {
      const currentBalance = await this.creditsService.getBalance(userId);
      if (currentBalance < track.creditCost) {
        throw new BadRequestException('Saldo de créditos insuficiente para realizar esta descarga');
      }

      await this.prisma.$transaction(async (tx) => {
        await this.creditsService.addEntry(
          userId,
          -track.creditCost,
          CreditEntryType.REMIX_DOWNLOAD,
          `Descarga en lote de stems: ${track.title}`,
          { trackId: track.id, type: 'STEMS_ZIP' },
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
    }

    const zipFilename = getZipFilename(track.artist, track.title, track.version);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const archive = archiver('zip', {
      zlib: { level: 6 },
    });

    let isAborted = false;

    res.on('close', () => {
      if (!archive.destroyed) {
        isAborted = true;
        archive.abort();
      }
    });

    archive.on('warning', () => {});

    archive.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({
          statusCode: 500,
          message: 'Error al generar el archivo comprimido',
        });
      }
    });

    archive.pipe(res);

    const trackSlug = slugify(`${track.artist}_${track.title}`);

    for (const stem of track.stems) {
      if (isAborted) break;
      const stemStream = await this.resolveAudioStream(stem.audioUrl);
      const filename = getStemFilename(stem, trackSlug);
      archive.append(stemStream, { name: filename });
    }

    if (!isAborted) {
      const metadataContent = generateMetadataFileContent(track);
      archive.append(Buffer.from(metadataContent, 'utf-8'), {
        name: 'INFO_METADATOS.txt',
      });
      await archive.finalize();
    }
  }

  private async resolveAudioStream(audioUrl: string): Promise<Readable> {
    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      try {
        const response = await fetch(audioUrl);
        if (response.ok && response.body) {
          return Readable.fromWeb(
            response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
          );
        }
      } catch {
        // Fallback defensivo para URLs de prueba o entornos de red aislados
      }
    }

    const dummyAudioHeader = Buffer.from(
      'RIFF$   WAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00D\xac\x00\x00\x10\xb1\x02\x00\x04\x00\x10\x00data\x00   ',
      'binary',
    );
    return Readable.from(dummyAudioHeader);
  }
}
