import { Module } from '@nestjs/common';
import { PingsController } from './pings.controller';

@Module({
  controllers: [PingsController],
})
export class PingsModule {}
