import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CreditsService } from '../src/modules/credits/credits.service';

describe('PayPal Webhooks & Idempotent Asynchronous Processing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditsService: CreditsService;

  const testUser = {
    email: 'webhook_e2e_user@remixdock.com',
    username: 'webhook_e2e_user',
    password: 'Password12345!',
  };

  let testUserId: string;
  let testPlanId: string;
  const creditsForTestPlan = 200;

  let pendingOrderId: string;
  const mockPaypalOrderId = 'MOCK-PAYPAL-WEBHOOK-ORDER-999';

  const validMockHeaders = {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123',
    'paypal-transmission-id': 'trans-uuid-999',
    'paypal-transmission-sig': 'VALID_MOCK_SIGNATURE_OK',
    'paypal-transmission-time': '2026-09-20T03:50:00Z',
  };

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

    // Clean up residual data
    await prisma.subscription.deleteMany({
      where: {
        user: { email: testUser.email },
      },
    });
    await prisma.order.deleteMany({
      where: {
        user: { email: testUser.email },
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [{ email: testUser.email }, { username: testUser.username }],
      },
    });
    await prisma.plan.deleteMany({
      where: {
        name: { in: ['Webhook E2E Test Plan'] },
      },
    });

    await app.init();

    // Register user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);
    testUserId = regRes.body.id;

    // Create plan
    const plan = await prisma.plan.create({
      data: {
        name: 'Webhook E2E Test Plan',
        description: 'Plan para pruebas de webhooks asíncronos',
        type: 'MONTHLY',
        price: 39.99,
        durationDays: 30,
        creditsIncluded: creditsForTestPlan,
        benefitsJson: ['Stems ilimitados'],
        canRequestRemix: true,
        isActive: true,
      },
    });
    testPlanId = plan.id;

    // Create a pending order for this user and plan
    const order = await prisma.order.create({
      data: {
        userId: testUserId,
        planId: testPlanId,
        amount: 39.99,
        currency: 'USD',
        status: 'PENDING',
        paypalOrderId: mockPaypalOrderId,
        metadataJson: {
          planName: plan.name,
          creditsIncluded: creditsForTestPlan,
        },
      },
    });
    pendingOrderId = order.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.subscription.deleteMany({
        where: {
          user: { email: testUser.email },
        },
      });
      await prisma.order.deleteMany({
        where: {
          user: { email: testUser.email },
        },
      });
      await prisma.user.deleteMany({
        where: {
          OR: [{ email: testUser.email }, { username: testUser.username }],
        },
      });
      await prisma.plan.deleteMany({
        where: {
          name: { in: ['Webhook E2E Test Plan'] },
        },
      });
    }
    await app.close();
  });

  it('1. POST /api/v1/payments/paypal/webhook with invalid signature is rejected with 400 Bad Request', async () => {
    // Missing headers entirely
    await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/webhook')
      .send({
        id: 'WH-INVALID-1',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource_type: 'capture',
        create_time: '2026-09-20T03:50:00Z',
        resource: {},
      })
      .expect(400);

    // Header with explicitly invalid signature
    const invalidHeaders = {
      ...validMockHeaders,
      'paypal-transmission-sig': 'invalid_signature',
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/webhook')
      .set(invalidHeaders)
      .send({
        id: 'WH-INVALID-2',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource_type: 'capture',
        create_time: '2026-09-20T03:50:00Z',
        resource: {},
      })
      .expect(400);

    expect(res.body.message).toBe('Firma de webhook inválida');
  });

  it('2. POST /api/v1/payments/paypal/webhook with valid PAYMENT.CAPTURE.COMPLETED completes order and credits user balance (200 OK)', async () => {
    const initialBalance = await creditsService.getBalance(testUserId);
    expect(initialBalance).toBe(0);

    const webhookPayload = {
      id: 'WH-EVENT-SUCCESS-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource_type: 'capture',
      create_time: '2026-09-20T03:50:00Z',
      resource: {
        id: 'CAPTURE-ID-999',
        custom_id: pendingOrderId,
        supplementary_data: {
          related_ids: {
            order_id: mockPaypalOrderId,
          },
        },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/webhook')
      .set(validMockHeaders)
      .send(webhookPayload)
      .expect(200);

    expect(response.body.received).toBe(true);
    expect(response.body.processed).toBe(true);

    // Verify order in database is now COMPLETED
    const orderInDb = await prisma.order.findUnique({
      where: { id: pendingOrderId },
    });
    expect(orderInDb?.status).toBe('COMPLETED');

    // Verify credit balance increased
    const updatedBalance = await creditsService.getBalance(testUserId);
    expect(updatedBalance).toBe(creditsForTestPlan);

    // Verify entry details in credit ledger
    const history = await creditsService.getHistory(testUserId);
    expect(history.length).toBe(1);
    expect(history[0].amount).toBe(creditsForTestPlan);
    expect(history[0].type).toBe('PLAN_SUBSCRIPTION');
    expect(history[0].description).toContain('Suscripción a membresía');

    // Verify subscription created
    const sub = await prisma.subscription.findFirst({
      where: { userId: testUserId, planId: testPlanId },
    });
    expect(sub).not.toBeNull();
    expect(sub?.status).toBe('ACTIVE');
    expect(sub?.currentPeriodStart).toBeDefined();
    expect(sub?.currentPeriodEnd).toBeDefined();
  });

  it('3. POST /api/v1/payments/paypal/webhook for already COMPLETED order is strictly idempotent (200 OK, no duplicate credits)', async () => {
    const balanceBefore = await creditsService.getBalance(testUserId);
    const historyBefore = await creditsService.getHistory(testUserId);

    const repeatWebhookPayload = {
      id: 'WH-EVENT-REPEAT-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource_type: 'capture',
      create_time: '2026-09-20T03:51:00Z',
      resource: {
        id: 'CAPTURE-ID-999',
        custom_id: pendingOrderId,
        supplementary_data: {
          related_ids: {
            order_id: mockPaypalOrderId,
          },
        },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/webhook')
      .set(validMockHeaders)
      .send(repeatWebhookPayload)
      .expect(200);

    expect(response.body.received).toBe(true);
    expect(response.body.processed).toBe(false);

    // Balance and history must remain unchanged
    const balanceAfter = await creditsService.getBalance(testUserId);
    const historyAfter = await creditsService.getHistory(testUserId);

    expect(balanceAfter).toBe(balanceBefore);
    expect(historyAfter.length).toBe(historyBefore.length);
  });

  it('4. POST /api/v1/payments/paypal/webhook with unhandled event returns 200 OK without mutating database', async () => {
    const unhandledPayload = {
      id: 'WH-EVENT-DISPUTE-1',
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource_type: 'dispute',
      create_time: '2026-09-20T03:52:00Z',
      resource: {
        id: 'DISPUTE-123',
      },
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/webhook')
      .set(validMockHeaders)
      .send(unhandledPayload)
      .expect(200);

    expect(response.body.received).toBe(true);
    expect(response.body.processed).toBe(false);
  });
});
