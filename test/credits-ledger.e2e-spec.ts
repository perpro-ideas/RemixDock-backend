import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreditEntryType } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CreditsService } from '../src/modules/credits/credits.service';

describe('Credit Ledger & Balance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditsService: CreditsService;

  const testUser = {
    email: 'credits_e2e_user@remixdock.com',
    username: 'credits_e2e_user',
    password: 'Password12345!',
  };

  let testUserId: string;
  let userToken: string;

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

    // Clean up any residual test data
    await prisma.user.deleteMany({
      where: {
        OR: [{ email: testUser.email }, { username: testUser.username }],
      },
    });

    await app.init();

    // Register test user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    testUserId = regRes.body.id;

    // Login test user
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    userToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          OR: [{ email: testUser.email }, { username: testUser.username }],
        },
      });
    }
    await app.close();
  });

  it('1. GET /api/v1/me/credits for newly registered user returns balance = 0 and empty history (200 OK)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.balance).toBe(0);
    expect(response.body.lastUpdated).toBeNull();
    expect(Array.isArray(response.body.history)).toBe(true);
    expect(response.body.history.length).toBe(0);
  });

  it('2. GET /api/v1/me/credits without authorization token returns 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .expect(401);
  });

  it('3. Add credit entries (+50 subscription, +15 topup) and verify consolidated balance is 65 (200 OK)', async () => {
    const entry1 = await creditsService.addEntry(
      testUserId,
      50,
      CreditEntryType.PLAN_SUBSCRIPTION,
      'Créditos por membresía mensual',
      { planType: 'MONTHLY' },
    );
    expect(entry1.id).toBeDefined();
    expect(entry1.amount).toBe(50);
    expect(entry1.type).toBe(CreditEntryType.PLAN_SUBSCRIPTION);

    const entry2 = await creditsService.addEntry(
      testUserId,
      15,
      CreditEntryType.TOPUP_PURCHASE,
      'Recarga adicional de créditos',
      { packId: 'pack_15' },
    );
    expect(entry2.id).toBeDefined();
    expect(entry2.amount).toBe(15);
    expect(entry2.type).toBe(CreditEntryType.TOPUP_PURCHASE);

    // Query endpoint to verify aggregate
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body.balance).toBe(65);
    expect(response.body.lastUpdated).not.toBeNull();
    expect(response.body.history.length).toBe(2);

    // Latest movement first
    expect(response.body.history[0].amount).toBe(15);
    expect(response.body.history[0].type).toBe(CreditEntryType.TOPUP_PURCHASE);
    expect(response.body.history[1].amount).toBe(50);
    expect(response.body.history[1].type).toBe(CreditEntryType.PLAN_SUBSCRIPTION);
  });

  it('4. Add debit entry (-5 download) and verify balance decreases to 60 (200 OK)', async () => {
    const debitEntry = await creditsService.addEntry(
      testUserId,
      -5,
      CreditEntryType.REMIX_DOWNLOAD,
      'Descarga de stem VIP',
      { stemId: 'stem_12345' },
    );
    expect(debitEntry.id).toBeDefined();
    expect(debitEntry.amount).toBe(-5);
    expect(debitEntry.type).toBe(CreditEntryType.REMIX_DOWNLOAD);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body.balance).toBe(60);
    expect(response.body.history.length).toBe(3);
    expect(response.body.history[0].amount).toBe(-5);
    expect(response.body.history[0].description).toBe('Descarga de stem VIP');
  });

  it('5. Consuming more credits than available rejects with 400 Bad Request and does not mutate balance', async () => {
    // Current balance is 60. Attempt to consume 100 credits (-100)
    await expect(
      creditsService.addEntry(
        testUserId,
        -100,
        CreditEntryType.REMIX_DOWNLOAD,
        'Descarga de paquete no autorizada',
      ),
    ).rejects.toThrow(BadRequestException);

    try {
      await creditsService.addEntry(
        testUserId,
        -100,
        CreditEntryType.REMIX_DOWNLOAD,
        'Descarga de paquete no autorizada',
      );
    } catch (error: unknown) {
      const err = error as BadRequestException;
      expect(err.message).toBe('Créditos insuficientes para realizar esta acción');
    }

    // Verify balance remains 60
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body.balance).toBe(60);
    expect(response.body.history.length).toBe(3);
  });

  it('6. Adding entry with 0 amount rejects with 400 Bad Request', async () => {
    await expect(
      creditsService.addEntry(
        testUserId,
        0,
        CreditEntryType.ADMIN_ADJUSTMENT,
        'Ajuste neutro no permitido',
      ),
    ).rejects.toThrow(BadRequestException);

    try {
      await creditsService.addEntry(
        testUserId,
        0,
        CreditEntryType.ADMIN_ADJUSTMENT,
        'Ajuste neutro no permitido',
      );
    } catch (error: unknown) {
      const err = error as BadRequestException;
      expect(err.message).toBe('El monto del movimiento no puede ser cero');
    }
  });
});
