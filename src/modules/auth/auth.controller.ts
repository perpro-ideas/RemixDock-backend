import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(registerDto);
  }
}
