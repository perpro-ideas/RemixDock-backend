import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { PlanResponseDto } from '../dto/plan-response.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';
import { PlansService } from '../plans.service';

@Controller('admin/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<PlanResponseDto[]> {
    return this.plansService.findAllAdmin();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePlanDto): Promise<PlanResponseDto> {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanResponseDto> {
    return this.plansService.update(id, dto);
  }
}
