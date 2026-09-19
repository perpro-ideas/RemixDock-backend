import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CreditsModule } from './modules/credits/credits.module';
import { HealthModule } from './modules/health/health.module';
import { PingsModule } from './modules/pings/pings.module';
import { PlansModule } from './modules/plans/plans.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    PingsModule,
    PlansModule,
    CreditsModule,
  ],
})
export class AppModule {}
