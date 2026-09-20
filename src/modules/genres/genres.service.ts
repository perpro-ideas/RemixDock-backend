import { Injectable } from '@nestjs/common';
import { Genre } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class GenresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Genre[]> {
    return this.prisma.genre.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
