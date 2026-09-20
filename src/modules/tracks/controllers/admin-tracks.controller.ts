import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CreateTrackDto } from '../dto/create-track.dto';
import { TrackResponseDto } from '../dto/track-response.dto';
import { UpdateTrackDto } from '../dto/update-track.dto';
import { TracksService } from '../tracks.service';

@Controller('admin/tracks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<TrackResponseDto> {
    return this.tracksService.findAdminById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTrackDto): Promise<TrackResponseDto> {
    return this.tracksService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTrackDto,
  ): Promise<TrackResponseDto> {
    return this.tracksService.update(id, dto);
  }
}
