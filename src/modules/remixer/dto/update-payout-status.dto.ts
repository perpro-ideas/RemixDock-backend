import { PayoutStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePayoutStatusDto {
  @IsEnum(PayoutStatus, {
    message: 'El estado debe ser un valor válido de PayoutStatus',
  })
  status: PayoutStatus;

  @IsOptional()
  @IsString({ message: 'El feedback debe ser una cadena de texto' })
  @MaxLength(1000, { message: 'El feedback no puede superar los 1000 caracteres' })
  adminFeedback?: string;
}
