import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

export interface PingResponse {
  message: string;
  user: AuthenticatedUser;
  timestamp: string;
}

@Controller('pings')
export class PingsController {
  @Get('admin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminPing(@CurrentUser() user: AuthenticatedUser): PingResponse {
    return {
      message: 'Admin access granted',
      user,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('remixer')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.REMIXER, Role.ADMIN)
  remixerPing(@CurrentUser() user: AuthenticatedUser): PingResponse {
    return {
      message: 'Remixer access granted',
      user,
      timestamp: new Date().toISOString(),
    };
  }
}
