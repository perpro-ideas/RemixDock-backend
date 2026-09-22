import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { AdminRequestsController } from './controllers/admin-requests.controller';
import { RequestsController } from './controllers/requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [CreditsModule],
  controllers: [RequestsController, AdminRequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
