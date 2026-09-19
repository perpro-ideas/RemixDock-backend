import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { HashService } from '../../common/services/hash.service';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';

export interface CreateUserData {
  email: string;
  username: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
  ) {}

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

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findResponseById(id: string): Promise<UserResponseDto | null> {
    return this.prisma.user.findUnique({
      where: { id },
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

  async updateHashedRefreshToken(
    userId: string,
    hashedToken: string | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: hashedToken },
    });
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const trimmedUsername = dto.username.trim();

    const existingUser = await this.findByUsername(trimmedUsername);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { username: trimmedUsername },
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

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isCurrentValid = await this.hashService.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }

    const newPasswordHash = await this.hashService.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        hashedRefreshToken: null,
      },
    });

    return {
      message: 'Contraseña actualizada exitosamente. Inicie sesión nuevamente.',
    };
  }
}
