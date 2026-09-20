import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CaptureOrderDto {
  @IsNotEmpty({ message: 'El identificador de la orden es obligatorio' })
  @IsUUID('all', { message: 'El identificador de la orden debe ser un UUID válido' })
  orderId: string;

  @IsNotEmpty({ message: 'El identificador de la orden de PayPal es obligatorio' })
  @IsString({ message: 'El identificador de la orden de PayPal debe ser una cadena válida' })
  paypalOrderId: string;
}
