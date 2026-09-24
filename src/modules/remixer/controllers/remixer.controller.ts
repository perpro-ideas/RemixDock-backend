import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/types/jwt-payload.interface';
import { CreatePayoutRequestDto } from '../dto/create-payout-request.dto';
import { PayoutResponseDto } from '../dto/payout-response.dto';
import { QueryEarningsDto } from '../dto/query-earnings.dto';
import { QueryPayoutsDto } from '../dto/query-payouts.dto';
import { StudioDashboardResponseDto } from '../dto/studio-dashboard-response.dto';
import {
  PaginatedEarningsResponse,
  RemixerEarningsService,
} from '../services/remixer-earnings.service';
import {
  PaginatedPayoutsResponse,
  PayoutsService,
} from '../services/payouts.service';

@Controller('remixer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.REMIXER, Role.ADMIN)
export class RemixerController {
  constructor(
    private readonly earningsService: RemixerEarningsService,
    private readonly payoutsService: PayoutsService,
  ) {}

  @Get(['studio', 'studio/dashboard'])
  @Roles(Role.REMIXER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getStudioDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudioDashboardResponseDto> {
    return this.earningsService.getStudioDashboard(user.id);
  }

  @Get('earnings')
  @HttpCode(HttpStatus.OK)
  async getEarnings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryEarningsDto,
  ): Promise<PaginatedEarningsResponse> {
    return this.earningsService.getEarnings(user.id, query);
  }

  @Post('payouts')
  @HttpCode(HttpStatus.CREATED)
  async createPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayoutRequestDto,
  ): Promise<PayoutResponseDto> {
    return this.payoutsService.createPayoutRequest(user.id, dto);
  }

  @Get('payouts')
  @HttpCode(HttpStatus.OK)
  async getPayouts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPayoutsDto,
  ): Promise<PaginatedPayoutsResponse> {
    return this.payoutsService.getRemixerPayouts(user.id, query);
  }

  @Get('payouts/:id')
  @HttpCode(HttpStatus.OK)
  async getPayoutById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PayoutResponseDto> {
    return this.payoutsService.getRemixerPayoutById(user.id, id);
  }
}
