import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CompleteRemixRequestDto {
  @IsNotEmpty()
  @IsUUID()
  trackId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}
