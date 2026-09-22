import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/types/jwt-payload.interface';
import { CreateRemixRequestDto } from '../dto/create-remix-request.dto';
import { QueryRemixRequestsDto } from '../dto/query-remix-requests.dto';
import {
  PaginatedRemixRequestsResult,
  RemixRequestResponseDto,
} from '../dto/remix-request-response.dto';
import { RequestsService } from '../requests.service';

@Controller('remix-requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRemixRequestDto,
  ): Promise<RemixRequestResponseDto> {
    return this.requestsService.createRequest(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async findMyRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryRemixRequestsDto,
  ): Promise<PaginatedRemixRequestsResult> {
    return this.requestsService.findMyRequests(user.id, query);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: QueryRemixRequestsDto,
  ): Promise<PaginatedRemixRequestsResult> {
    return this.requestsService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<RemixRequestResponseDto> {
    return this.requestsService.findById(id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RemixRequestResponseDto> {
    return this.requestsService.cancelRequest(id, user.id);
  }
}
