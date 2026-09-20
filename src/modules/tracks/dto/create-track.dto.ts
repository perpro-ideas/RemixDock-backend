import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { StemType } from '@prisma/client';

export class CreateStemDto {
  @IsNotEmpty({ message: 'El nombre del stem es obligatorio' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'El tipo de stem es obligatorio' })
  @IsEnum(StemType, { message: 'Tipo de stem inválido' })
  type: StemType;

  @IsNotEmpty({ message: 'La URL de audio del stem es obligatoria' })
  @IsString()
  audioUrl: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditCost?: number = 1;
}

export class CreateTrackDto {
  @IsNotEmpty({ message: 'El título es obligatorio' })
  @IsString()
  title: string;

  @IsNotEmpty({ message: 'El artista es obligatorio' })
  @IsString()
  artist: string;

  @IsOptional()
  @IsString()
  remixer?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsNotEmpty({ message: 'El género es obligatorio' })
  @IsUUID('all', { message: 'El identificador del género debe ser un UUID válido' })
  genreId: string;

  @IsNotEmpty({ message: 'El BPM es obligatorio' })
  @IsInt({ message: 'El BPM debe ser un número entero' })
  @Min(40)
  @Max(250)
  bpm: number;

  @IsNotEmpty({ message: 'La tonalidad armónica musicalKey es obligatoria' })
  @IsString()
  musicalKey: string;

  @IsNotEmpty({ message: 'La duración en segundos es obligatoria' })
  @IsInt({ message: 'La duración debe ser un número entero' })
  @Min(1)
  durationSeconds: number;

  @IsNotEmpty({ message: 'La URL de audio de preescucha es obligatoria' })
  @IsString()
  previewAudioUrl: string;

  @IsNotEmpty({ message: 'La URL de descarga del máster es obligatoria' })
  @IsString()
  downloadAudioUrl: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  waveformJson?: unknown;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditCost?: number = 1;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPublished?: boolean = true;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStemDto)
  stems?: CreateStemDto[];
}
