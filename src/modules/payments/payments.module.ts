import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './services/payments.service';
import { PaypalService } from './services/paypal.service';

@Module({
  imports: [CreditsModule],
  controllers: [PaymentsController],
  providers: [PaypalService, PaymentsService],
  exports: [PaymentsService, PaypalService],
})
export class PaymentsModule {}
