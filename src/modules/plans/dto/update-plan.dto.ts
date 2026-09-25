import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CreatePlanDto } from './create-plan.dto';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @IsOptional()
  @IsInt({ message: 'El límite de peticiones de remix debe ser un número entero' })
  @Min(0, { message: 'El límite de peticiones de remix no puede ser negativo' })
  remixRequestsLimit?: number;
}
