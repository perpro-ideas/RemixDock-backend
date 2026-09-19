import { Module } from '@nestjs/common';
import { HashService } from '../../common/services/hash.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, HashService],
  exports: [AuthService],
})
export class AuthModule {}
