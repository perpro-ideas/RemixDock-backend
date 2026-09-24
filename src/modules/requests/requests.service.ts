import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreditEntryType,
  FundingType,
  Prisma,
  RemixRequestStatus,
  RemixerEarningType,
  Role,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CreditsService } from '../credits/credits.service';
import { AssignRemixerDto } from './dto/assign-remixer.dto';
import { AvailableRemixerDto } from './dto/available-remixer.dto';
import { CompleteRemixRequestDto } from './dto/complete-remix-request.dto';
import { CreateRemixRequestDto } from './dto/create-remix-request.dto';
import { QueryAdminRemixRequestsDto } from './dto/query-admin-remix-requests.dto';
import { QueryRemixRequestsDto } from './dto/query-remix-requests.dto';
import { RejectRemixRequestDto } from './dto/reject-remix-request.dto';
import {
  PaginatedRemixRequestsResult,
  RemixRequestResponseDto,
} from './dto/remix-request-response.dto';
import { RemixRequestQuotaResponseDto } from './dto/remix-request-quota-response.dto';

const DEFAULT_INCLUDE = {
  user: { select: { id: true, username: true } },
  remixer: { select: { id: true, username: true } },
  deliveredTrack: { select: { id: true, title: true, artist: true, previewAudioUrl: true } },
  genre: { select: { id: true, name: true, slug: true } },
} as const;

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
  ) {}

  async getUserQuota(userId: string): Promise<RemixRequestQuotaResponseDto> {
    const now = new Date();
    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { gt: now },
      },
      include: { plan: true },
    });

    if (!activeSub || !activeSub.plan.canRequestRemix) {
      return {
        planName: null,
        hasSubscription: false,
        canRequestRemix: false,
        monthlyLimit: 0,
        usedThisPeriod: 0,
        remaining: 0,
      };
    }

    const monthlyLimit = 2;
    const usedThisPeriod = await this.prisma.remixRequest.count({
      where: {
        userId,
        fundingType: FundingType.INCLUDED_IN_PLAN,
        createdAt: {
          gte: activeSub.currentPeriodStart,
          lte: activeSub.currentPeriodEnd,
        },
        status: {
          notIn: [RemixRequestStatus.REJECTED, RemixRequestStatus.CANCELLED],
        },
      },
    });

    return {
      planName: activeSub.plan.name,
      hasSubscription: true,
      canRequestRemix: true,
      monthlyLimit,
      usedThisPeriod,
      remaining: Math.max(0, monthlyLimit - usedThisPeriod),
      periodEnd: activeSub.currentPeriodEnd,
    };
  }

  async createRequest(
    userId: string,
    dto: CreateRemixRequestDto,
  ): Promise<RemixRequestResponseDto> {
    const desiredBpm = dto.desiredBpm ?? dto.targetBpm;

    if (dto.genreId) {
      const genre = await this.prisma.genre.findUnique({
        where: { id: dto.genreId },
      });
      if (!genre) {
        throw new BadRequestException('El género especificado no existe');
      }
    }

    if (dto.fundingType === FundingType.INCLUDED_IN_PLAN) {
      const now = new Date();
      const activeSub = await this.prisma.subscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { gt: now },
        },
        include: { plan: true },
      });

      if (!activeSub || !activeSub.plan.canRequestRemix) {
        throw new BadRequestException(
          'Tu plan de suscripción actual no incluye peticiones de remixes. Mejora a un plan Pro o utiliza créditos de tu cuenta.',
        );
      }

      // Máximo 2 peticiones de remixes incluidas por periodo mensual
      const MAX_PLAN_REQUESTS_PER_PERIOD = 2;
      const countInPeriod = await this.prisma.remixRequest.count({
        where: {
          userId,
          fundingType: FundingType.INCLUDED_IN_PLAN,
          createdAt: {
            gte: activeSub.currentPeriodStart,
            lte: activeSub.currentPeriodEnd,
          },
          status: {
            notIn: [RemixRequestStatus.REJECTED, RemixRequestStatus.CANCELLED],
          },
        },
      });

      if (countInPeriod >= MAX_PLAN_REQUESTS_PER_PERIOD) {
        throw new BadRequestException(
          'Has alcanzado el límite de peticiones de remixes incluidas en tu ciclo de facturación actual.',
        );
      }

      const created = await this.prisma.remixRequest.create({
        data: {
          userId,
          title: dto.title,
          artist: dto.artist,
          genreId: dto.genreId,
          referenceUrl: dto.referenceUrl,
          desiredBpm,
          notes: dto.notes,
          fundingType: FundingType.INCLUDED_IN_PLAN,
          bountyCredits: 0,
          status: RemixRequestStatus.PENDING,
        },
        include: DEFAULT_INCLUDE,
      });

      return RemixRequestResponseDto.fromEntity(created);
    }

    // Modalidad CREDITS_BOUNTY
    if (!dto.bountyCredits || dto.bountyCredits < 1) {
      throw new BadRequestException(
        'Debes especificar una cantidad de créditos válida para la recompensa (mínimo 1 crédito).',
      );
    }

    const currentBalance = await this.creditsService.getBalance(userId);
    if (currentBalance < dto.bountyCredits) {
      throw new BadRequestException(
        'Saldo de créditos insuficiente para publicar esta petición con recompensa.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.creditsService.addEntry(
        userId,
        -dto.bountyCredits!,
        CreditEntryType.REMIX_REQUEST_ESCROW,
        `Custodia para petición de remix: ${dto.title}`,
        { title: dto.title, artist: dto.artist },
        tx,
      );

      return tx.remixRequest.create({
        data: {
          userId,
          title: dto.title,
          artist: dto.artist,
          genreId: dto.genreId,
          referenceUrl: dto.referenceUrl,
          desiredBpm,
          notes: dto.notes,
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: dto.bountyCredits!,
          status: RemixRequestStatus.PENDING,
        },
        include: DEFAULT_INCLUDE,
      });
    });

    return RemixRequestResponseDto.fromEntity(created);
  }

  private buildPrivacyWhere(
    user: AuthenticatedUser,
    query: QueryRemixRequestsDto,
  ): Prisma.RemixRequestWhereInput {
    const conditions: Prisma.RemixRequestWhereInput[] = [];

    // Privacy isolation clause by role
    if (user.role === Role.ADMIN) {
      // Admins have global visibility
    } else if (user.role === Role.REMIXER) {
      // Remixers see their own requests and those assigned to them
      conditions.push({
        OR: [{ userId: user.id }, { remixerId: user.id }],
      });
    } else {
      // Regular DJs (USER) strictly see only their own requests
      conditions.push({
        userId: user.id,
      });
    }

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.fundingType) {
      conditions.push({ fundingType: query.fundingType });
    }

    if (query.genreSlug) {
      conditions.push({ genre: { slug: query.genreSlug } });
    }

    if (query.search) {
      const term = query.search.trim();
      conditions.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { artist: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (conditions.length === 0) {
      return {};
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return {
      AND: conditions,
    };
  }

  async findMyRequests(
    user: AuthenticatedUser,
    query: QueryRemixRequestsDto,
  ): Promise<PaginatedRemixRequestsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildPrivacyWhere(user, query);

    const [total, items] = await Promise.all([
      this.prisma.remixRequest.count({ where }),
      this.prisma.remixRequest.findMany({
        where,
        include: DEFAULT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: items.map((r) => RemixRequestResponseDto.fromEntity(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findAll(
    user: AuthenticatedUser,
    query: QueryRemixRequestsDto,
  ): Promise<PaginatedRemixRequestsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildPrivacyWhere(user, query);

    const [total, items] = await Promise.all([
      this.prisma.remixRequest.count({ where }),
      this.prisma.remixRequest.findMany({
        where,
        include: DEFAULT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: items.map((r) => RemixRequestResponseDto.fromEntity(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<RemixRequestResponseDto> {
    const request = await this.prisma.remixRequest.findUnique({
      where: { id },
      include: DEFAULT_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('La petición de remix no existe');
    }

    if (user.role === Role.ADMIN) {
      return RemixRequestResponseDto.fromEntity(request);
    }

    if (user.role === Role.REMIXER) {
      if (request.userId !== user.id && request.remixerId !== user.id) {
        throw new ForbiddenException(
          'No tienes permiso para consultar esta petición de remix',
        );
      }
      return RemixRequestResponseDto.fromEntity(request);
    }

    // Role.USER
    if (request.userId !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para consultar esta petición de remix',
      );
    }

    return RemixRequestResponseDto.fromEntity(request);
  }

  async cancelRequest(
    id: string,
    userId: string,
  ): Promise<RemixRequestResponseDto> {
    const request = await this.prisma.remixRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('La petición de remix no existe');
    }

    if (request.userId !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para cancelar esta petición de remix',
      );
    }

    if (request.status !== RemixRequestStatus.PENDING) {
      throw new BadRequestException(
        'Solo puedes cancelar peticiones en estado pendiente antes de que comience su producción.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        request.fundingType === FundingType.CREDITS_BOUNTY &&
        request.bountyCredits > 0
      ) {
        await this.creditsService.addEntry(
          userId,
          request.bountyCredits,
          CreditEntryType.REMIX_REQUEST_REFUND,
          `Reembolso por cancelación de petición de remix: ${request.title}`,
          { requestId: request.id },
          tx,
        );
      }

      return tx.remixRequest.update({
        where: { id },
        data: {
          status: RemixRequestStatus.CANCELLED,
        },
        include: DEFAULT_INCLUDE,
      });
    });

    return RemixRequestResponseDto.fromEntity(updated);
  }

  // --- Endpoints Administrativos ---

  async findAllAdmin(
    query: QueryAdminRemixRequestsDto,
  ): Promise<PaginatedRemixRequestsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RemixRequestWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.fundingType) {
      where.fundingType = query.fundingType;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.remixerId) {
      where.remixerId = query.remixerId;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { artist: { contains: term, mode: 'insensitive' } },
        { user: { username: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.remixRequest.count({ where }),
      this.prisma.remixRequest.findMany({
        where,
        include: DEFAULT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: items.map((r) => RemixRequestResponseDto.fromEntity(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findAdminById(id: string): Promise<RemixRequestResponseDto> {
    const request = await this.prisma.remixRequest.findUnique({
      where: { id },
      include: DEFAULT_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('La petición de remix solicitada no existe');
    }

    return RemixRequestResponseDto.fromEntity(request);
  }

  async assignRemixer(
    id: string,
    dto: AssignRemixerDto,
  ): Promise<RemixRequestResponseDto> {
    const request = await this.prisma.remixRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('La petición de remix no existe');
    }

    if (
      request.status === RemixRequestStatus.COMPLETED ||
      request.status === RemixRequestStatus.REJECTED ||
      request.status === RemixRequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede asignar un remixer a una petición finalizada, rechazada o cancelada',
      );
    }

    const remixer = await this.prisma.user.findUnique({
      where: { id: dto.remixerId },
    });

    if (
      !remixer ||
      (remixer.role !== Role.REMIXER && remixer.role !== Role.ADMIN)
    ) {
      throw new BadRequestException(
        'El usuario especificado debe tener perfil de remixer o administrador',
      );
    }

    const notesToSave = dto.adminNotes ?? dto.notes;

    const updated = await this.prisma.remixRequest.update({
      where: { id },
      data: {
        remixerId: dto.remixerId,
        status: RemixRequestStatus.IN_PROGRESS,
        ...(notesToSave !== undefined && notesToSave !== null ? { adminFeedback: notesToSave } : {}),
      },
      include: DEFAULT_INCLUDE,
    });

    return RemixRequestResponseDto.fromEntity(updated);
  }

  async completeRequest(
    id: string,
    dto: CompleteRemixRequestDto,
  ): Promise<RemixRequestResponseDto> {
    const request = await this.prisma.remixRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('La petición de remix no existe');
    }

    if (request.status === RemixRequestStatus.COMPLETED) {
      throw new BadRequestException(
        'La petición de remix ya ha sido completada previamente',
      );
    }

    if (
      request.status === RemixRequestStatus.REJECTED ||
      request.status === RemixRequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'No se puede completar una petición que ha sido rechazada o cancelada',
      );
    }

    const track = await this.prisma.track.findUnique({
      where: { id: dto.trackId },
    });

    if (!track) {
      throw new BadRequestException(
        'La pista musical entregada no existe en el catálogo',
      );
    }

    const feedback = dto.notes || dto.adminNotes;
    const shouldPublish =
      dto.publishToCatalog === true || dto.isExclusive === false;

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Actualizar visibilidad del track en catálogo o exclusividad para el DJ y vincular remixer si no lo tenía
      await tx.track.update({
        where: { id: dto.trackId },
        data: {
          isPublished: shouldPublish,
          ...(track.remixerId ? {} : { remixerId: request.remixerId }),
        },
      });

      // 2. Actualizar la petición
      const req = await tx.remixRequest.update({
        where: { id },
        data: {
          trackId: track.id,
          status: RemixRequestStatus.COMPLETED,
          adminFeedback: feedback || request.adminFeedback,
        },
        include: DEFAULT_INCLUDE,
      });

      // 3. Persistencia en downloads con costCredits = 0 para el solicitante
      const existingDownload = await tx.download.findFirst({
        where: {
          userId: request.userId,
          trackId: track.id,
          stemId: null,
        },
      });

      if (!existingDownload) {
        await tx.download.create({
          data: {
            userId: request.userId,
            trackId: track.id,
            costCredits: 0,
          },
        });
      }

      // 4. Liquidación de recompensa al remixer asignado si fue financiado con créditos
      if (
        request.fundingType === FundingType.CREDITS_BOUNTY &&
        request.bountyCredits > 0 &&
        request.remixerId
      ) {
        await tx.remixerEarning.create({
          data: {
            remixerId: request.remixerId,
            amountCredits: new Prisma.Decimal(request.bountyCredits),
            type: RemixerEarningType.REMIX_BOUNTY,
            requestId: request.id,
            trackId: track.id,
            description: `Recompensa por remix exclusivo completado: ${request.title}`,
          },
        });
      }

      return req;
    });

    return RemixRequestResponseDto.fromEntity(updated);
  }

  async rejectRequest(
    id: string,
    dto: RejectRemixRequestDto,
  ): Promise<RemixRequestResponseDto> {
    const request = await this.prisma.remixRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('La petición de remix no existe');
    }

    if (request.status === RemixRequestStatus.COMPLETED) {
      throw new BadRequestException(
        'No se puede rechazar una petición que ya ha sido completada y entregada',
      );
    }

    if (request.status === RemixRequestStatus.REJECTED) {
      throw new BadRequestException(
        'La petición de remix ya ha sido rechazada previamente',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        request.fundingType === FundingType.CREDITS_BOUNTY &&
        request.bountyCredits > 0
      ) {
        await this.creditsService.addEntry(
          request.userId,
          request.bountyCredits,
          CreditEntryType.REMIX_REQUEST_REFUND,
          `Reembolso por petición de remix rechazada: ${request.title}`,
          { requestId: request.id, reason: dto.reason },
          tx,
        );
      }

      return tx.remixRequest.update({
        where: { id },
        data: {
          status: RemixRequestStatus.REJECTED,
          adminFeedback: dto.reason,
        },
        include: DEFAULT_INCLUDE,
      });
    });

    return RemixRequestResponseDto.fromEntity(updated);
  }

  async getAvailableRemixers(): Promise<AvailableRemixerDto[]> {
    return this.prisma.user.findMany({
      where: {
        role: { in: [Role.REMIXER, Role.ADMIN] },
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
      orderBy: { username: 'asc' },
    });
  }
}
