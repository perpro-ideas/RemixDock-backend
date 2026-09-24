import { FundingType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRemixRequestDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  artist: string;

  @IsOptional()
  @IsUUID()
  genreId?: string;

  @IsOptional()
  @IsUrl()
  referenceUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(200)
  desiredBpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(200)
  targetBpm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsEnum(FundingType)
  fundingType: FundingType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bountyCredits?: number;
}
