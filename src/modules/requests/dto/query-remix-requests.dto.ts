import { FundingType, RemixRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryRemixRequestsDto {
  @IsOptional()
  @IsEnum(RemixRequestStatus)
  status?: RemixRequestStatus;

  @IsOptional()
  @IsEnum(FundingType)
  fundingType?: FundingType;

  @IsOptional()
  @IsString()
  genreSlug?: string;

  @IsOptional()
  @IsString()
  search?: string;

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
