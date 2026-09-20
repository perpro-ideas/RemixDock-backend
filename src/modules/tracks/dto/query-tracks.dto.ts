import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryTracksDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  genreSlug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  minBpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(200)
  maxBpm?: number;

  @IsOptional()
  @IsString()
  musicalKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
