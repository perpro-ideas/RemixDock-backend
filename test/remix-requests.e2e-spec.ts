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
  let dj2Token: string;

  let adminUserId: string;
  let djUserId: string;
  let remixerUserId: string;
  let dj2UserId: string;

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

    // Register and authenticate second DJ for cross-user privacy isolation testing
    const dj2Email = 'dj2_privacy_test@remixdock.com';
    await prisma.user.deleteMany({
      where: { email: dj2Email },
    });
    const dj2Register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: dj2Email,
        username: 'dj2_privacy_user',
        password: 'Password123!',
      })
      .expect(201);
    dj2UserId = dj2Register.body.id;

    const dj2Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: dj2Email,
        password: 'Password123!',
      })
      .expect(200);
    dj2Token = dj2Login.body.accessToken;

    // Retrieve or seed Plans
    const basicPlan = await prisma.plan.findFirst({
      where: { name: 'DJ Starter' },
    });
    basicPlanId = basicPlan?.id ?? '';

    const proClubPlan = await prisma.plan.findFirst({
      where: { name: 'DJ Pro Club' },
    });
    if (proClubPlan && proClubPlan.remixRequestsLimit !== 2) {
      await prisma.plan.update({
        where: { id: proClubPlan.id },
        data: { remixRequestsLimit: 2 },
      });
    }
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
      const userIdsToDelete = [djUserId];
      if (dj2UserId) userIdsToDelete.push(dj2UserId);

      // Clean up requests created during tests
      await prisma.download.deleteMany({
        where: {
          costCredits: 0,
          userId: { in: userIdsToDelete },
        },
      });
      await prisma.remixRequest.deleteMany({
        where: {
          userId: { in: userIdsToDelete },
        },
      });
      await prisma.subscription.deleteMany({
        where: {
          userId: { in: userIdsToDelete },
        },
      });
      if (dj2UserId) {
        await prisma.user.deleteMany({
          where: { id: dj2UserId },
        });
      }
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

    it('GET /api/v1/remix-requests without token is rejected (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/remix-requests')
        .expect(401);
    });

    it('GET /api/v1/remix-requests/me without token is rejected (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/remix-requests/me')
        .expect(401);
    });

    it('GET /api/v1/remix-requests/quota without token is rejected (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/remix-requests/quota')
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

    it('GET /api/v1/admin/remix-requests/remixers without token is rejected (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/remix-requests/remixers')
        .expect(401);
    });

    it('GET /api/v1/admin/remix-requests/remixers with regular DJ token is rejected (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/remix-requests/remixers')
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

    it('GET /api/v1/remix-requests/quota returns correct quota metrics before and after usage (200 OK)', async () => {
      // 1. Without subscription
      const resNoSub = await request(app.getHttpServer())
        .get('/api/v1/remix-requests/quota')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resNoSub.body.hasSubscription).toBe(false);
      expect(resNoSub.body.canRequestRemix).toBe(false);
      expect(resNoSub.body.monthlyLimit).toBe(0);
      expect(resNoSub.body.usedThisPeriod).toBe(0);
      expect(resNoSub.body.remaining).toBe(0);

      // 2. With Pro Club subscription
      await prisma.subscription.create({
        data: {
          userId: djUserId,
          planId: proClubPlanId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const resSub = await request(app.getHttpServer())
        .get('/api/v1/remix-requests/quota')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resSub.body.hasSubscription).toBe(true);
      expect(resSub.body.canRequestRemix).toBe(true);
      expect(resSub.body.planName).toBe('DJ Pro Club');
      expect(resSub.body.monthlyLimit).toBe(2);
      expect(resSub.body.usedThisPeriod).toBe(0);
      expect(resSub.body.remaining).toBe(2);

      // 3. Create 1 request and verify quota reflects usage
      await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Single Quota Test',
          artist: 'Artist',
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(201);

      const resUsed = await request(app.getHttpServer())
        .get('/api/v1/remix-requests/quota')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resUsed.body.usedThisPeriod).toBe(1);
      expect(resUsed.body.remaining).toBe(1);
    });

    it('Accepts targetBpm alias without throwing 400 forbidNonWhitelisted error (201 Created)', async () => {
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
          title: 'Target BPM Alias Track',
          artist: 'Electronic Duo',
          targetBpm: 128,
          fundingType: FundingType.INCLUDED_IN_PLAN,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.desiredBpm).toBe(128);
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

      // 2. Admin assigns Remixer with notes -> IN_PROGRESS and stores adminFeedback
      const assignRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/remix-requests/${requestId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          remixerId: remixerUserId,
          notes: 'Instrucciones para versión pista principal',
          adminNotes: 'Priorizar frecuencias bajas y percusión limpia',
        })
        .expect(200);

      expect(assignRes.body.status).toBe(RemixRequestStatus.IN_PROGRESS);
      expect(assignRes.body.remixerId).toBe(remixerUserId);
      expect(assignRes.body.adminFeedback).toBe(
        'Priorizar frecuencias bajas y percusión limpia',
      );

      // DJ attempts to cancel while IN_PROGRESS -> rejected
      await request(app.getHttpServer())
        .post(`/api/v1/remix-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      // 3. Admin completes request with a delivered Track, notes alias, and publishToCatalog
      const completeRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/remix-requests/${requestId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          trackId: testTrackId,
          notes: 'Versión masterizada y lista para cabina.',
          publishToCatalog: true,
        })
        .expect(200);

      expect(completeRes.body.status).toBe(RemixRequestStatus.COMPLETED);
      expect(completeRes.body.trackId).toBe(testTrackId);
      expect(completeRes.body.adminFeedback).toBe(
        'Versión masterizada y lista para cabina.',
      );

      // Verify track isPublished was set to true
      const trackAfterPublish = await prisma.track.findUnique({
        where: { id: testTrackId },
      });
      expect(trackAfterPublish?.isPublished).toBe(true);

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

    it('Admin can complete request as exclusive (isExclusive: true), keeping track private (isPublished: false)', async () => {
      // 1. Create a request
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Private Exclusive Club Mix',
          artist: 'Underground Artist',
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: 5,
        })
        .expect(201);

      const requestId = createRes.body.id;

      // 2. Complete with isExclusive: true
      const completeRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/remix-requests/${requestId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          trackId: testTrackId,
          isExclusive: true,
          adminNotes: 'Versión exclusiva solo para el DJ solicitante.',
        })
        .expect(200);

      expect(completeRes.body.status).toBe(RemixRequestStatus.COMPLETED);

      // Verify track is kept private (isPublished: false)
      const trackAfterExclusive = await prisma.track.findUnique({
        where: { id: testTrackId },
      });
      expect(trackAfterExclusive?.isPublished).toBe(false);

      // Restore track to isPublished: true for remaining tests
      await prisma.track.update({
        where: { id: testTrackId },
        data: { isPublished: true },
      });
    });

    it('GET /api/v1/admin/remix-requests/remixers returns producers list for assignment dropdown (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/remix-requests/remixers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const producer = res.body.find((u: { id: string }) => u.id === remixerUserId);
      expect(producer).toBeDefined();
      expect(producer.username).toBeDefined();
      expect(producer.email).toBeDefined();
      expect(['REMIXER', 'ADMIN']).toContain(producer.role);

      // Sensitive fields must never be exposed
      expect(producer.passwordHash).toBeUndefined();
      expect(producer.hashedRefreshToken).toBeUndefined();
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

    it('GET /api/v1/remix-requests with DJ token returns only their requests (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      for (const item of res.body.items) {
        expect(item.userId).toBe(djUserId);
      }
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

  describe('8. Privacy Isolation & Cross-Account Isolation', () => {
    let dj1RequestId: string;

    beforeAll(async () => {
      await creditsService.addEntry(
        djUserId,
        50,
        CreditEntryType.TOPUP_PURCHASE,
        'Créditos para peticiones de prueba',
      );

      const reqRes = await request(app.getHttpServer())
        .post('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Isolation Track Test',
          artist: 'Privacy Artist',
          fundingType: FundingType.CREDITS_BOUNTY,
          bountyCredits: 10,
        })
        .expect(201);

      dj1RequestId = reqRes.body.id;
    });

    it('DJ 2 cannot see DJ 1 request in GET /api/v1/remix-requests/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/remix-requests/me')
        .set('Authorization', `Bearer ${dj2Token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('DJ 2 cannot see DJ 1 request in general GET /api/v1/remix-requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${dj2Token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('DJ 2 is rejected when inspecting DJ 1 request directly via GET /api/v1/remix-requests/:id (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/remix-requests/${dj1RequestId}`)
        .set('Authorization', `Bearer ${dj2Token}`)
        .expect(403);

      expect(res.body.message).toContain('No tienes permiso');
    });

    it('Unassigned Remixer is rejected when inspecting DJ 1 request directly (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/remix-requests/${dj1RequestId}`)
        .set('Authorization', `Bearer ${remixerToken}`)
        .expect(403);

      expect(res.body.message).toContain('No tienes permiso');
    });

    it('Unassigned Remixer does not see DJ 1 request in GET /api/v1/remix-requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${remixerToken}`)
        .expect(200);

      const found = res.body.items.find(
        (item: { id: string }) => item.id === dj1RequestId,
      );
      expect(found).toBeUndefined();
    });

    it('Once assigned, Remixer can access DJ 1 request in detail and feed', async () => {
      // Admin assigns Remixer
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/remix-requests/${dj1RequestId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ remixerId: remixerUserId })
        .expect(200);

      // Now Remixer can view detail
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/remix-requests/${dj1RequestId}`)
        .set('Authorization', `Bearer ${remixerToken}`)
        .expect(200);

      expect(detailRes.body.id).toBe(dj1RequestId);
      expect(detailRes.body.remixerId).toBe(remixerUserId);

      // Now Remixer sees it in GET /api/v1/remix-requests
      const feedRes = await request(app.getHttpServer())
        .get('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${remixerToken}`)
        .expect(200);

      const found = feedRes.body.items.find(
        (item: { id: string }) => item.id === dj1RequestId,
      );
      expect(found).toBeDefined();
    });

    it('Admin can view any request in detail and list all requests across users', async () => {
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/remix-requests/${dj1RequestId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detailRes.body.id).toBe(dj1RequestId);

      const feedRes = await request(app.getHttpServer())
        .get('/api/v1/remix-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(feedRes.body.total).toBeGreaterThanOrEqual(1);
    });
  });
});
