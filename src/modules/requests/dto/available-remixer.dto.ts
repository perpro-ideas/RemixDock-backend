import { Role } from '@prisma/client';

export class AvailableRemixerDto {
  id: string;
  username: string;
  email: string;
  role: Role;
}
