import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Genre } from '@prisma/client';
import { GenresService } from './genres.service';

@Controller('genres')
export class GenresController {
  constructor(private readonly genresService: GenresService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<Genre[]> {
    return this.genresService.findAll();
  }
}
