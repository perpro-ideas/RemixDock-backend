import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AssignRemixerDto } from '../dto/assign-remixer.dto';
import { CompleteRemixRequestDto } from '../dto/complete-remix-request.dto';
import { QueryAdminRemixRequestsDto } from '../dto/query-admin-remix-requests.dto';
import { RejectRemixRequestDto } from '../dto/reject-remix-request.dto';
import {
  PaginatedRemixRequestsResult,
  RemixRequestResponseDto,
} from '../dto/remix-request-response.dto';
import { RequestsService } from '../requests.service';

@Controller('admin/remix-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminRequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: QueryAdminRemixRequestsDto,
  ): Promise<PaginatedRemixRequestsResult> {
    return this.requestsService.findAllAdmin(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<RemixRequestResponseDto> {
    return this.requestsService.findAdminById(id);
  }

  @Patch(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assignRemixer(
    @Param('id') id: string,
    @Body() dto: AssignRemixerDto,
  ): Promise<RemixRequestResponseDto> {
    return this.requestsService.assignRemixer(id, dto);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id') id: string,
    @Body() dto: CompleteRemixRequestDto,
  ): Promise<RemixRequestResponseDto> {
    return this.requestsService.completeRequest(id, dto);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectRemixRequestDto,
  ): Promise<RemixRequestResponseDto> {
    return this.requestsService.rejectRequest(id, dto);
  }
}
