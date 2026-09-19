import { ConflictException, Injectable } from '@nestjs/common';
import { HashService } from '../../common/services/hash.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashService: HashService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const existingUsername = await this.usersService.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    const passwordHash = await this.hashService.hash(dto.password);

    return this.usersService.create({
      email: dto.email,
      username: dto.username,
      passwordHash,
    });
  }
}
