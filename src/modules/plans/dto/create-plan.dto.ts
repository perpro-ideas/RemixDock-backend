import { PlanType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @IsString({ message: 'El nombre del plan debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre del plan debe tener al menos 3 caracteres' })
  name: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  description?: string;

  @IsEnum(PlanType, { message: 'El tipo de plan no es válido' })
  type: PlanType;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'El precio no puede ser negativo' })
  price: number;

  @IsInt({ message: 'La duración en días debe ser un número entero' })
  @Min(1, { message: 'La duración en días debe ser de al menos 1 día' })
  durationDays: number;

  @IsInt({ message: 'Los créditos incluidos deben ser un número entero' })
  @Min(0, { message: 'Los créditos incluidos no pueden ser negativos' })
  creditsIncluded: number;

  @IsArray({ message: 'Los beneficios deben ser un arreglo' })
  @IsString({ each: true, message: 'Cada beneficio debe ser una cadena de texto' })
  benefits: string[];

  @IsOptional()
  @IsBoolean({ message: 'El permiso de solicitar remix debe ser un booleano' })
  canRequestRemix?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser un booleano' })
  isActive?: boolean;
}
