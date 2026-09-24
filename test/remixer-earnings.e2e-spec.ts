import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreditEntryType, FundingType, RemixRequestStatus, RemixerEarningType, Role, StemType } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CreditsService } from '../src/modules/credits/credits.service';

describe('Remixer Studio, Royalties & Earnings Ledger (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditsService: CreditsService;

  const remixerUser = {
    email: 'remixer_earnings_e2e@remixdock.com',
    username: 'pro_remixer_e2e',
    password: 'Password12345!',
  };

  const djUser = {
    email: 'dj_earnings_e2e@remixdock.com',
    username: 'dj_buyer_e2e',
    password: 'Password12345!',
  };

  const adminUser = {
    email: 'admin_earnings_e2e@remixdock.com',
    username: 'admin_audit_e2e',
    password: 'Password12345!',
  };

  let remixerId: string;
  let remixerToken: string;
  let djId: string;
  let djToken: string;
  let adminId: string;
  let adminToken: string;
  let genreId: string;
  let trackId: string;
  let stemId: string;

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

    // Clean up residual test data
    await prisma.remixerEarning.deleteMany({
      where: {
        remixer: {
          email: { in: [remixerUser.email, djUser.email, adminUser.email] },
        },
      },
    });
    await prisma.download.deleteMany({
      where: {
        user: { email: { in: [djUser.email, remixerUser.email] } },
      },
    });
    await prisma.remixRequest.deleteMany({
      where: {
        user: { email: { in: [djUser.email, remixerUser.email] } },
      },
    });
    await prisma.creditLedgerEntry.deleteMany({
      where: {
        user: { email: { in: [djUser.email, remixerUser.email] } },
      },
    });
    await prisma.stem.deleteMany({
      where: { name: 'E2E Remixer Drum Stem' },
    });
    await prisma.track.deleteMany({
      where: { title: 'E2E Remixer Royalty Track' },
    });
    await prisma.genre.deleteMany({
      where: { slug: 'e2e-remixer-genre' },
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: [remixerUser.email, djUser.email, adminUser.email] },
      },
    });

    // Create test genre
    const genre = await prisma.genre.create({
      data: {
        name: 'E2E Remixer Genre',
        slug: 'e2e-remixer-genre',
      },
    });
    genreId = genre.id;

    // Register & login remixer
    const remixerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(remixerUser)
      .expect(201);
    remixerId = remixerRes.body.id;

    await prisma.user.update({
      where: { id: remixerId },
      data: { role: Role.REMIXER },
    });

    const remixerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: remixerUser.email, password: remixerUser.password })
      .expect(200);
    remixerToken = remixerLogin.body.accessToken;

    // Register & login regular DJ
    const djRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(djUser)
      .expect(201);
    djId = djRes.body.id;

    const djLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: djUser.email, password: djUser.password })
      .expect(200);
    djToken = djLogin.body.accessToken;

    // Register & login admin
    const adminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(adminUser)
      .expect(201);
    adminId = adminRes.body.id;

    await prisma.user.update({
      where: { id: adminId },
      data: { role: Role.ADMIN },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: adminUser.email, password: adminUser.password })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    // Create track produced by remixer
    const track = await prisma.track.create({
      data: {
        title: 'E2E Remixer Royalty Track',
        artist: 'Electro Pioneer',
        remixer: remixerUser.username,
        remixerId: remixerId,
        version: 'Club Remix',
        genreId: genreId,
        bpm: 126,
        musicalKey: '5A',
        durationSeconds: 300,
        previewAudioUrl: 'https://storage.remixdock.com/previews/royalty.mp3',
        downloadAudioUrl: 'https://storage.remixdock.com/masters/royalty.wav',
        creditCost: 2,
        isPublished: true,
        stems: {
          create: [
            {
              name: 'E2E Remixer Drum Stem',
              type: StemType.DRUMS,
              audioUrl: 'https://storage.remixdock.com/stems/royalty-drum.wav',
              creditCost: 1,
            },
          ],
        },
      },
      include: { stems: true },
    });
    trackId = track.id;
    stemId = track.stems[0].id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.remixerEarning.deleteMany({
        where: {
          remixer: {
            email: { in: [remixerUser.email, djUser.email, adminUser.email] },
          },
        },
      });
      await prisma.download.deleteMany({
        where: {
          user: {
            email: { in: [remixerUser.email, djUser.email, adminUser.email] },
          },
        },
      });
      await prisma.remixRequest.deleteMany({
        where: {
          user: {
            email: { in: [remixerUser.email, djUser.email, adminUser.email] },
          },
        },
      });
      await prisma.creditLedgerEntry.deleteMany({
        where: {
          user: {
            email: { in: [remixerUser.email, djUser.email, adminUser.email] },
          },
        },
      });
      await prisma.stem.deleteMany({
        where: { name: 'E2E Remixer Drum Stem' },
      });
      await prisma.track.deleteMany({
        where: { title: 'E2E Remixer Royalty Track' },
      });
      await prisma.genre.deleteMany({
        where: { slug: 'e2e-remixer-genre' },
      });
      await prisma.user.deleteMany({
        where: {
          email: { in: [remixerUser.email, djUser.email, adminUser.email] },
        },
      });
    }
    await app.close();
  });

  it('1. Unauthenticated requests to /api/v1/remixer/* return 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/remixer/earnings')
      .expect(401);
  });

  it('2. Regular DJ (Role.USER) requests to /api/v1/remixer/* return 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${djToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/remixer/earnings')
      .set('Authorization', `Bearer ${djToken}`)
      .expect(403);
  });

  it('3. Remixer requests initial /studio/dashboard returns 0 balances and 1 produced track', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(response.body.totalEarnedCredits).toBe(0);
    expect(response.body.availableBalanceCredits).toBe(0);
    expect(response.body.activeTracksCount).toBe(1);
    expect(response.body.assignedRequestsCount).toBe(0);
    expect(Array.isArray(response.body.recentEarnings)).toBe(true);
    expect(response.body.recentEarnings.length).toBe(0);
  });

  it('4. DJ acquires catalog track (costs 2 credits): Remixer automatically receives 70% royalties (1.40 credits)', async () => {
    // Top up DJ with 10 credits
    await creditsService.addEntry(
      djId,
      10,
      CreditEntryType.TOPUP_PURCHASE,
      'Recarga de créditos para DJ comprador',
    );

    // DJ acquires track
    const downloadRes = await request(app.getHttpServer())
      .post(`/api/v1/tracks/${trackId}/download`)
      .set('Authorization', `Bearer ${djToken}`)
      .expect(200);

    expect(downloadRes.body.costCredits).toBe(2);

    // Verify remixer earning was created automatically
    const earning = await prisma.remixerEarning.findFirst({
      where: {
        remixerId,
        trackId,
        type: RemixerEarningType.ROYALTY_DOWNLOAD,
      },
    });

    expect(earning).not.toBeNull();
    expect(Number(earning?.amountCredits)).toBe(1.4);
    expect(earning?.description).toContain('Regalías por descarga de pista');

    // Verify dashboard reflects available balance
    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(dashboard.body.totalEarnedCredits).toBe(1.4);
    expect(dashboard.body.availableBalanceCredits).toBe(1.4);
  });

  it('5. DJ re-downloads track (costs 0 credits): Remixer does NOT receive duplicated royalties', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tracks/${trackId}/download`)
      .set('Authorization', `Bearer ${djToken}`)
      .expect(200);

    const earningsCount = await prisma.remixerEarning.count({
      where: { remixerId, trackId, type: RemixerEarningType.ROYALTY_DOWNLOAD },
    });
    expect(earningsCount).toBe(1);
  });

  it('6. DJ acquires individual stem (costs 1 credit): Remixer automatically receives 0.70 credits (70%)', async () => {
    const downloadRes = await request(app.getHttpServer())
      .post(`/api/v1/stems/${stemId}/download`)
      .set('Authorization', `Bearer ${djToken}`)
      .expect(200);

    expect(downloadRes.body.costCredits).toBe(1);

    const stemEarning = await prisma.remixerEarning.findFirst({
      where: {
        remixerId,
        type: RemixerEarningType.ROYALTY_DOWNLOAD,
        description: { contains: 'stem' },
      },
    });

    expect(stemEarning).not.toBeNull();
    expect(Number(stemEarning?.amountCredits)).toBe(0.7);

    // Total balance: 1.40 + 0.70 = 2.10
    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(dashboard.body.availableBalanceCredits).toBe(2.1);
  });

  it('7. Exclusive Remix Request completed by admin accredits 100% of bounty credits to Remixer', async () => {
    // DJ creates remix request with 10 credits bounty
    const requestRes = await request(app.getHttpServer())
      .post('/api/v1/remix-requests')
      .set('Authorization', `Bearer ${djToken}`)
      .send({
        title: 'Exclusive Festival Banger',
        artist: 'Anthem Maker',
        genreId,
        bountyCredits: 5,
        fundingType: FundingType.CREDITS_BOUNTY,
      })
      .expect(201);

    const requestId = requestRes.body.id;

    // Admin assigns remixer
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/remix-requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ remixerId })
      .expect(200);

    // Admin completes request
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/remix-requests/${requestId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ trackId })
      .expect(200);

    // Verify bounty earning
    const bountyEarning = await prisma.remixerEarning.findFirst({
      where: {
        remixerId,
        requestId,
        type: RemixerEarningType.REMIX_BOUNTY,
      },
    });

    expect(bountyEarning).not.toBeNull();
    expect(Number(bountyEarning?.amountCredits)).toBe(5);
    expect(bountyEarning?.description).toContain('Recompensa por remix exclusivo completado');

    // Balance: 2.10 + 5.00 = 7.10
    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(dashboard.body.availableBalanceCredits).toBe(7.1);
    expect(dashboard.body.totalEarnedCredits).toBe(7.1);
  });

  it('8. GET /api/v1/remixer/earnings returns paginated earnings ledger with relations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/remixer/earnings?page=1&limit=10')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(response.body.total).toBe(3);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBe(3);

    // Check entry structure
    const firstItem = response.body.items[0];
    expect(firstItem.id).toBeDefined();
    expect(firstItem.remixerId).toBe(remixerId);
    expect(firstItem.amountCredits).toBeGreaterThan(0);
    expect(firstItem.type).toBeDefined();
    expect(firstItem.description).toBeDefined();
  });
});
