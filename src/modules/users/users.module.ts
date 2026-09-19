import { Module } from '@nestjs/common';
import { HashService } from '../../common/services/hash.service';
import { PrismaModule } from '../../database/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, HashService],
  exports: [UsersService],
})
export class UsersModule {}
