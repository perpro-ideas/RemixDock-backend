import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UserResponseDto } from './dto/user-response.dto';

export interface CreateUserData {
  email: string;
  username: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username: username.trim() },
    });
  }

  async create(data: CreateUserData): Promise<UserResponseDto> {
    return this.prisma.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        username: data.username.trim(),
        passwordHash: data.passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
