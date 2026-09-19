import { IsString, Matches, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString({ message: 'El nombre de usuario debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre de usuario debe tener al menos 3 caracteres' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'El username solo permite caracteres alfanuméricos, guiones y subguiones',
  })
  username: string;
}
