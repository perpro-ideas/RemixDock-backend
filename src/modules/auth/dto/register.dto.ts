import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email: string;

  @IsString({ message: 'El nombre de usuario debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre de usuario debe tener mínimo 3 caracteres' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'El username solo permite caracteres alfanuméricos, guiones y subguiones',
  })
  username: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener mínimo 8 caracteres' })
  password: string;
}
