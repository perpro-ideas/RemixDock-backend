import {
  Body,
  Controller,
  Headers,
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
import { PaypalWebhookEvent } from './dto/paypal-webhook.dto';
import {
  CaptureOrderResult,
  CreateOrderResult,
  PaymentsService,
  WebhookProcessResult,
} from './services/payments.service';

@Controller('payments/paypal')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<CreateOrderResult> {
    return this.paymentsService.createOrder(user.id, dto.planId);
  }

  @Post('capture-order')
  @UseGuards(JwtAuthGuard)
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

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: PaypalWebhookEvent,
  ): Promise<WebhookProcessResult> {
    return this.paymentsService.handleWebhook(headers, body);
  }
}
