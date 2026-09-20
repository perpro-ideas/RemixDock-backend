import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CreditsModule } from './modules/credits/credits.module';
import { GenresModule } from './modules/genres/genres.module';
import { HealthModule } from './modules/health/health.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PingsModule } from './modules/pings/pings.module';
import { PlansModule } from './modules/plans/plans.module';
import { TracksModule } from './modules/tracks/tracks.module';
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
    PaymentsModule,
    GenresModule,
    TracksModule,
  ],
})
export class AppModule {}
