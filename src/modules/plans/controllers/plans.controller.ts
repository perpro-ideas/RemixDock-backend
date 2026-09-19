import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { PlanResponseDto } from '../dto/plan-response.dto';
import { PlansService } from '../plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<PlanResponseDto[]> {
    return this.plansService.findAllPublic();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string): Promise<PlanResponseDto> {
    return this.plansService.findPublicById(id);
  }
}
