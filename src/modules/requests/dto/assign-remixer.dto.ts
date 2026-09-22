import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignRemixerDto {
  @IsNotEmpty()
  @IsUUID()
  remixerId: string;
}
