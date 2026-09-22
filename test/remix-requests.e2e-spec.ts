import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditEntryType,
  FundingType,
  PlanType,
  RemixRequestStatus,
  Role,
  SubscriptionStatus,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CreditsService } from '../src/modules/credits/credits.service';

describe('Remix Requests Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditsService: CreditsService;

  let adminToken: string;
  let userToken: string;
  let remixerToken: string;

  let adminUserId: string;
  let djUserId: string;
  let remixerUserId: string;

  let basicPlanId: string;
  let proClubPlanId: string;
  let testGenreId: string;
  let testTrackId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.use(cookieParser());

    prisma = app.get(PrismaService);
    creditsService = app.get(CreditsService);

    await app.init();

    // Authenticate Admin
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'admin@remixdock.com',
        password: 'Admin12345!',
      })
      .expect(200);
    adminToken = adminLogin.body.accessToken;
    adminUserId = adminLogin.body.user.id;

    // Authenticate Regular DJ user
    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'user@remixdock.com',
        password: 'User12345!',
      })
      .expect(200);
    userToken = userLogin.body.accessToken;
    djUserId = userLogin.body.user.id;

    // Authenticate Remixer user
    const remixerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'remixer@remixdock.com',
        password: 'Remixer12345!',
      })
      .expect(200);
    remixerToken = remixerLogin.body.accessToken;
    remixerUserId = remixerLogin.body.user.id;

    // Retrieve or seed Plans
    const basicPlan = await prisma.plan.findFirst({
      where: { name: 'DJ Starter' },
    });
    basicPlanId = basicPlan?.id ?? '';

    const proClubPlan = await prisma.plan.findFirst({
      where: { name: 'DJ Pro Club' },
    });
    proClubPlanId = proClubPlan?.id ?? '';

    // Retrieve tech-house genre
    const genre = await prisma.genre.findUnique({
      where: { slug: 'tech-house' },
    });
    testGenreId = genre?.id ?? '';

    // Retrieve a sample track for completion delivery test
    const sampleTrack = await prisma.track.findFirst({
      where: { isPublished: true },
    });
    testTrackId = sampleTrack?.id ?? '';
  });

  afterAll(async () => {
    if (prisma) {
      // Clean up requests created during tests
      await prisma.download.deleteMany({
        where: {
          costCredits: 0,
          userId: djUserId,
        },
      });
      await prisma.remixRequest.deleteMany({
        where: {
          userId: djUserId,
        },
      });
      await prisma.subscription.deleteMany({
        where: {
          userId: djUserId,
        },
      });
    }
    await app.close();
  });

  describe('1. Security & Authentication Checks', () => {
    it('POST /api/v1/remix-requests without token is rejected (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .send({
          title: 'Titanium',
          artist: 'David Guetta',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(401);
    });

    it('GET /api/v1/admin/remix-requests without token is rejected (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/remix-requests')
        .expect(401);
    });

    it('GET /api/v1/admin/remix-requests with regular DJ token is rejected (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('2. INCLUDED_IN_PLAN Workflow & Quota Enforcement', () => {
    beforeEach(async () => {
      // Ensure DJ has no active subscriptions
      await prisma.subscription.deleteMany({
        where: { userId: djUserId },
      });
      await prisma.remixRequest.deleteMany({
        where: { userId: djUserId },
      });
    });

    it('Rejects INCLUDED_IN_PLAN if DJ has no active subscription (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'One More Time',
          artist: 'Daft Punk',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(400);

      expect(res.body.message).toContain('no incluye peticiones de remixes');
    });

    it('Rejects INCLUDED_IN_PLAN if DJ has a plan without remix requests benefit (DJ Starter) (400 Bad Request)', async () => {
      // Create active subscription with basic plan (canRequestRemix = false)
      await prisma.subscription.create({
        data: {
          userId: djUserId,
          planId: basicPlanId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Levels',
          artist: 'Avicii',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(400);

      expect(res.body.message).toContain('no incluye peticiones de remixes');
    });

    it('Accepts INCLUDED_IN_PLAN if DJ has an active Pro Club plan (201 Created)', async () => {
      // Create active subscription with Pro Club plan (canRequestRemix = true)
      await prisma.subscription.create({
        data: {
          userId: djUserId,
          planId: proClubPlanId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Losing It',
          artist: 'Fisher',
          genreId: testGenreId,
          desiredBpm: 126,
          notes: 'High energy drop for mainstage set',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Losing It');
      expect(res.body.fundingType).toBe(FundingType.INCLUDED_IN_PLAN);
      expect(res.body.bountyCredits).toBe(0);
      expect(res.body.status).toBe(RemixRequestStatus.PENDING);
    });

    it('Enforces period quota: maximum 2 plan requests per billing cycle (400 Bad Request on 3rd)', async () => {
      // Setup subscription
      await prisma.subscription.create({
        data: {
          userId: djUserId,
          planId: proClubPlanId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // 1st request -> OK
      await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Request 1',
          artist: 'Artist 1',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(201);

      // 2nd request -> OK
      await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Request 2',
          artist: 'Artist 2',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(201);

      // 3rd request -> Should fail because quota is 2
      const res = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Request 3',
          artist: 'Artist 3',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(400);

      expect(res.body.message).toContain('límite de peticiones de remixes');
    });
  });

  describe('3. CREDITS_BOUNTY Escrow & Ledger Debit Workflow', () => {
    let initialBalance: number;

    beforeEach(async () => {
      await prisma.remixRequest.deleteMany({
        where: { userId: djUserId },
      });
      initialBalance = await creditsService.getBalance(djUserId);
    });

    it('Rejects CREDITS_BOUNTY if DJ has insufficient credit balance (400 Bad Request)', async () => {
      const exorbitantBounty = initialBalance + 9999;

      const res = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Pepas',
          artist: 'Farruko',
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: exorbitantBounty,
        })
        .expect(400);

      expect(res.body.message).toContain('Saldo de créditos insuficiente');
    });

    it('Debits credits atomically into escrow when creating CREDITS_BOUNTY (201 Created)', async () => {
      // Ensure DJ has at least 30 credits for testing
      await creditsService.addEntry(
        djUserId,
        50,
        CreditEntryType.TOPUP_PURCHASE,
        'Carga de créditos para prueba E2E de peticiones',
      );

      const balanceBefore = await creditsService.getBalance(djUserId);
      const bountyAmount = 25;

      const res = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Ferrari',
          artist: 'James Hype',
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: bountyAmount,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.fundingType).toBe(FundingType.CREDITS_BOUNTY);
      expect(res.body.bountyCredits).toBe(bountyAmount);
      expect(res.body.status).toBe(RemixRequestStatus.PENDING);

      // Verify balance was debited by bountyAmount
      const balanceAfter = await creditsService.getBalance(djUserId);
      expect(balanceAfter).toBe(balanceBefore - bountyAmount);

      // Verify ledger entry type is REMIX_REQUEST_ESCROW
      const lastEntry = await prisma.creditLedgerEntry.findFirst({
        where: { userId: djUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(lastEntry?.type).toBe(CreditEntryType.REMIX_REQUEST_ESCROW);
      expect(lastEntry?.amount).toBe(-bountyAmount);
    });
  });

  describe('4. Rejection & Refund Workflow', () => {
    it('Admin rejects a bounty request and credits are refunded immediately (200 OK)', async () => {
      // Add balance and create request
      await creditsService.addEntry(
        djUserId,
        20,
        CreditEntryType.TOPUP_PURCHASE,
        'Carga para prueba de rechazo',
      );

      const balanceBeforeRequest = await creditsService.getBalance(djUserId);
      const bounty = 15;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Unviable Song',
          artist: 'Obscure Band',
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: bounty,
        })
        .expect(201);

      const requestId = createRes.body.id;
      expect(await creditsService.getBalance(djUserId)).toBe(
        balanceBeforeRequest - bounty,
      );

      // Admin rejects the request
      const rejectRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/remix-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'No hay acapellas limpias disponibles para este tema.',
        })
        .expect(200);

      expect(rejectRes.body.status).toBe(RemixRequestStatus.REJECTED);
      expect(rejectRes.body.adminFeedback).toBe(
        'No hay acapellas limpias disponibles para este tema.',
      );

      // Balance must be restored to balanceBeforeRequest
      const balanceAfterReject = await creditsService.getBalance(djUserId);
      expect(balanceAfterReject).toBe(balanceBeforeRequest);

      // Verify ledger has REMIX_REQUEST_REFUND
      const refundEntry = await prisma.creditLedgerEntry.findFirst({
        where: { userId: djUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(refundEntry?.type).toBe(CreditEntryType.REMIX_REQUEST_REFUND);
      expect(refundEntry?.amount).toBe(bounty);
    });
  });

  describe('5. DJ Self-Cancellation Workflow', () => {
    it('DJ can cancel their own PENDING bounty request with automatic refund (200 OK)', async () => {
      await creditsService.addEntry(
        djUserId,
        20,
        CreditEntryType.TOPUP_PURCHASE,
        'Carga para prueba de cancelación',
      );

      const balanceBefore = await creditsService.getBalance(djUserId);
      const bounty = 10;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Cancelling My Request',
          artist: 'Some Artist',
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: bounty,
        })
        .expect(201);

      const requestId = createRes.body.id;
      expect(await creditsService.getBalance(djUserId)).toBe(
        balanceBefore - bounty,
      );

      // DJ cancels the request
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/remix-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(cancelRes.body.status).toBe(RemixRequestStatus.CANCELLED);

      // Verify balance restored
      const balanceAfterCancel = await creditsService.getBalance(djUserId);
      expect(balanceAfterCancel).toBe(balanceBefore);

      const lastEntry = await prisma.creditLedgerEntry.findFirst({
        where: { userId: djUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(lastEntry?.type).toBe(CreditEntryType.REMIX_REQUEST_REFUND);
      expect(lastEntry?.amount).toBe(bounty);
    });
  });

  describe('6. Assignment & Completion with Library Delivery', () => {
    it('Admin assigns remixer and completes request, delivering track directly to DJ library at cost 0 (200 OK)', async () => {
      // 1. Create request
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Subliminal Groove VIP',
          artist: 'Marco Carola',
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: 5,
        })
        .expect(201);

      const requestId = createRes.body.id;

      // 2. Admin assigns Remixer -> IN_PROGRESS
      const assignRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/remix-requests/${requestId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          remixerId: remixerUserId,
        })
        .expect(200);

      expect(assignRes.body.status).toBe(RemixRequestStatus.IN_PROGRESS);
      expect(assignRes.body.remixerId).toBe(remixerUserId);

      // DJ attempts to cancel while IN_PROGRESS -> rejected
      await request(app.getHttpServer())
        .post(`/api/v1/remix-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      // 3. Admin completes request with a delivered Track
      const completeRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/remix-requests/${requestId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          trackId: testTrackId,
          adminNotes: 'Versión masterizada y lista para cabina.',
        })
        .expect(200);

      expect(completeRes.body.status).toBe(RemixRequestStatus.COMPLETED);
      expect(completeRes.body.trackId).toBe(testTrackId);

      // 4. Verify Track appears immediately in DJ library with costCredits = 0
      const libraryRes = await request(app.getHttpServer())
        .get('/api/v1/me/library')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const deliveredTrack = libraryRes.body.find(
        (item: { track: { id: string } }) => item.track?.id === testTrackId,
      );

      expect(deliveredTrack).toBeDefined();
      expect(deliveredTrack.costCredits).toBe(0);
    });
  });

  describe('7. Querying and Feed Endpoints', () => {
    it('GET /api/v1/remix-requests/me returns paginated list of user requests (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/remix-requests/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.page).toBe(1);
    });

    it('GET /api/v1/remix-requests returns community requests board (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/remix-requests')
        .expect(200);

      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('GET /api/v1/admin/remix-requests as ADMIN returns all requests with admin filters (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/remix-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });
  });
});
