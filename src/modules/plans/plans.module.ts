import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AdminPlansController } from './controllers/admin-plans.controller';
import { PlansController } from './controllers/plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlansController, AdminPlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
