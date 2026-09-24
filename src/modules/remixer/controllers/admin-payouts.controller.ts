import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PayoutResponseDto } from '../dto/payout-response.dto';
import { QueryPayoutsDto } from '../dto/query-payouts.dto';
import { UpdatePayoutStatusDto } from '../dto/update-payout-status.dto';
import {
  PaginatedPayoutsResponse,
  PayoutsService,
} from '../services/payouts.service';

@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getPayouts(
    @Query() query: QueryPayoutsDto,
  ): Promise<PaginatedPayoutsResponse> {
    return this.payoutsService.getAdminPayouts(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getPayoutById(@Param('id') id: string): Promise<PayoutResponseDto> {
    return this.payoutsService.getAdminPayoutById(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePayoutStatusDto,
  ): Promise<PayoutResponseDto> {
    return this.payoutsService.updatePayoutStatus(id, dto);
  }
}
