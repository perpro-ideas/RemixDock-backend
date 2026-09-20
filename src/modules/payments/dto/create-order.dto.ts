import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsNotEmpty({ message: 'El identificador del plan es obligatorio' })
  @IsUUID('all', { message: 'El identificador del plan debe ser un UUID válido' })
  planId: string;
}
