import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectRemixRequestDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
