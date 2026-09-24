import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AdminPayoutsController } from './controllers/admin-payouts.controller';
import { RemixerController } from './controllers/remixer.controller';
import { PayoutsService } from './services/payouts.service';
import { RemixerEarningsService } from './services/remixer-earnings.service';

@Module({
  imports: [PrismaModule],
  controllers: [RemixerController, AdminPayoutsController],
  providers: [RemixerEarningsService, PayoutsService],
  exports: [RemixerEarningsService, PayoutsService],
})
export class RemixerModule {}
