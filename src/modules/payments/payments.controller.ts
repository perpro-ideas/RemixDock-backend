import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CaptureOrderDto } from './dto/capture-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  CaptureOrderResult,
  CreateOrderResult,
  PaymentsService,
} from './services/payments.service';

@Controller('payments/paypal')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<CreateOrderResult> {
    return this.paymentsService.createOrder(user.id, dto.planId);
  }

  @Post('capture-order')
  @HttpCode(HttpStatus.OK)
  async captureOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CaptureOrderDto,
  ): Promise<CaptureOrderResult> {
    return this.paymentsService.captureOrder(
      user.id,
      dto.orderId,
      dto.paypalOrderId,
    );
  }
}
