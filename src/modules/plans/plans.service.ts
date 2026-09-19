import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPublic(): Promise<PlanResponseDto[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
    return plans.map((plan) => PlanResponseDto.fromEntity(plan));
  }

  async findAllAdmin(): Promise<PlanResponseDto[]> {
    const plans = await this.prisma.plan.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return plans.map((plan) => PlanResponseDto.fromEntity(plan));
  }

  async findById(id: string): Promise<PlanResponseDto> {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
    });
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }
    return PlanResponseDto.fromEntity(plan);
  }

  async findPublicById(id: string): Promise<PlanResponseDto> {
    const plan = await this.prisma.plan.findFirst({
      where: { id, isActive: true },
    });
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }
    return PlanResponseDto.fromEntity(plan);
  }

  async create(dto: CreatePlanDto): Promise<PlanResponseDto> {
    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type,
        price: new Prisma.Decimal(dto.price),
        durationDays: dto.durationDays,
        creditsIncluded: dto.creditsIncluded,
        benefitsJson: dto.benefits,
        canRequestRemix: dto.canRequestRemix ?? false,
        isActive: dto.isActive ?? true,
      },
    });
    return PlanResponseDto.fromEntity(plan);
  }

  async update(id: string, dto: UpdatePlanDto): Promise<PlanResponseDto> {
    const existing = await this.prisma.plan.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Plan no encontrado');
    }

    const dataToUpdate: Prisma.PlanUpdateInput = {};

    if (dto.name !== undefined) {
      dataToUpdate.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      dataToUpdate.description = dto.description.trim();
    }
    if (dto.type !== undefined) {
      dataToUpdate.type = dto.type;
    }
    if (dto.price !== undefined) {
      dataToUpdate.price = new Prisma.Decimal(dto.price);
    }
    if (dto.durationDays !== undefined) {
      dataToUpdate.durationDays = dto.durationDays;
    }
    if (dto.creditsIncluded !== undefined) {
      dataToUpdate.creditsIncluded = dto.creditsIncluded;
    }
    if (dto.benefits !== undefined) {
      dataToUpdate.benefitsJson = dto.benefits;
    }
    if (dto.canRequestRemix !== undefined) {
      dataToUpdate.canRequestRemix = dto.canRequestRemix;
    }
    if (dto.isActive !== undefined) {
      dataToUpdate.isActive = dto.isActive;
    }

    const updated = await this.prisma.plan.update({
      where: { id },
      data: dataToUpdate,
    });

    return PlanResponseDto.fromEntity(updated);
  }
}
