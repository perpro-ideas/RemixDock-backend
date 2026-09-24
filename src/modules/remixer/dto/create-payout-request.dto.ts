import { PayoutMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  Min,
} from 'class-validator';

export class CreatePayoutRequestDto {
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de créditos a retirar debe ser un número entero' })
  @Min(20, { message: 'El retiro mínimo permitido es de 20 créditos ($20.00 USD)' })
  creditsAmount: number;

  @IsEnum(PayoutMethod, {
    message: 'El método de retiro debe ser PAYPAL o BANK_TRANSFER',
  })
  method: PayoutMethod;

  @IsObject({ message: 'Los datos de destino deben ser un objeto válido' })
  @IsNotEmptyObject({}, { message: 'Los datos de destino no pueden estar vacíos' })
  destinationDetails: Record<string, unknown>;
}
