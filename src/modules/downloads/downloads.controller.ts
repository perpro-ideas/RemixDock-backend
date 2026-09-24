import { Controller, Get, HttpCode, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { DownloadsService } from './downloads.service';
import { DownloadResponseDto } from './dto/download-response.dto';
import { LibraryItemResponseDto } from './dto/library-item-response.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Post('tracks/:id/download')
  @HttpCode(HttpStatus.OK)
  async downloadTrack(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DownloadResponseDto> {
    return this.downloadsService.downloadTrack(user.id, id);
  }

  @Post('stems/:id/download')
  @HttpCode(HttpStatus.OK)
  async downloadStem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DownloadResponseDto> {
    return this.downloadsService.downloadStem(user.id, id);
  }

  @Post(['downloads/track/:id/stems/zip', 'tracks/:id/stems/zip'])
  @HttpCode(HttpStatus.OK)
  async downloadTrackStemsZip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.downloadsService.downloadTrackStemsZip(user.id, id, res);
  }

  @Get('me/library')
  @HttpCode(HttpStatus.OK)
  async getUserLibrary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LibraryItemResponseDto[]> {
    return this.downloadsService.getUserLibrary(user.id);
  }
}

