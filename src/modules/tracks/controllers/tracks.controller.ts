import { Controller, Get, HttpCode, HttpStatus, Param, Query } from '@nestjs/common';
import { QueryTracksDto } from '../dto/query-tracks.dto';
import { TrackResponseDto } from '../dto/track-response.dto';
import { PaginatedTracksResult, TracksService } from '../tracks.service';

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: QueryTracksDto): Promise<PaginatedTracksResult> {
    return this.tracksService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<TrackResponseDto> {
    return this.tracksService.findById(id);
  }
}
