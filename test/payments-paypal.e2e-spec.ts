import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('PayPal Payments & Idempotent Credits Accreditation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: 'paypal_e2e_user@remixdock.com',
    username: 'paypal_e2e_user',
    password: 'Password12345!',
  };

  let testUserId: string;
  let userToken: string;

  let activePlanId: string;
  let inactivePlanId: string;
  const creditsForActivePlan = 150;

  let createdOrderId: string;
  let createdPaypalOrderId: string;

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

    // Clean up test data
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
        name: { in: ['PayPal E2E Active Plan', 'PayPal E2E Inactive Plan'] },
      },
    });

    await app.init();

    // Register and login test user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);
    testUserId = regRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);
    userToken = loginRes.body.accessToken;

    // Create test active plan
    const activePlan = await prisma.plan.create({
      data: {
        name: 'PayPal E2E Active Plan',
        description: 'Plan activo con créditos para pruebas de pagos',
        type: 'MONTHLY',
        price: 29.99,
        durationDays: 30,
        creditsIncluded: creditsForActivePlan,
        benefitsJson: ['Descargas Pro', 'Acceso anticipado'],
        canRequestRemix: true,
        isActive: true,
      },
    });
    activePlanId = activePlan.id;

    // Create test inactive plan
    const inactivePlan = await prisma.plan.create({
      data: {
        name: 'PayPal E2E Inactive Plan',
        description: 'Plan deshabilitado',
        type: 'MONTHLY',
        price: 49.99,
        durationDays: 30,
        creditsIncluded: 200,
        benefitsJson: ['VIP'],
        canRequestRemix: true,
        isActive: false,
      },
    });
    inactivePlanId = inactivePlan.id;
  });

  afterAll(async () => {
    if (prisma) {
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
          name: { in: ['PayPal E2E Active Plan', 'PayPal E2E Inactive Plan'] },
        },
      });
    }
    await app.close();
  });

  it('1. POST /api/v1/payments/paypal/create-order for active plan creates order in PENDING status (201 Created)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ planId: activePlanId })
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.orderId).toBeDefined();
    expect(response.body.paypalOrderId).toBeDefined();
    expect(response.body.approvalUrl).toBeDefined();
    expect(response.body.amount).toBe(29.99);
    expect(response.body.currency).toBe('USD');

    createdOrderId = response.body.orderId;
    createdPaypalOrderId = response.body.paypalOrderId;

    // Verify order in database is PENDING
    const orderInDb = await prisma.order.findUnique({
      where: { id: createdOrderId },
    });
    expect(orderInDb).not.toBeNull();
    expect(orderInDb?.status).toBe('PENDING');
    expect(orderInDb?.paypalOrderId).toBe(createdPaypalOrderId);
    expect(orderInDb?.userId).toBe(testUserId);
  });

  it('2. POST /api/v1/payments/paypal/create-order with invalid or inactive plan returns 404 Not Found', async () => {
    // Non-existent plan UUID
    await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ planId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    // Inactive plan
    await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/create-order')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ planId: inactivePlanId })
      .expect(404);
  });

  it('3. POST /api/v1/payments/paypal/capture-order captures successfully, updates order to COMPLETED and credits ledger (200 OK)', async () => {
    // Check initial balance
    const initialCreditsRes = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const initialBalance = initialCreditsRes.body.balance;

    // Capture the created order
    const captureRes = await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        orderId: createdOrderId,
        paypalOrderId: createdPaypalOrderId,
      })
      .expect(200);

    expect(captureRes.body).toBeDefined();
    expect(captureRes.body.order).toBeDefined();
    expect(captureRes.body.order.status).toBe('COMPLETED');
    expect(captureRes.body.order.id).toBe(createdOrderId);

    // Verify order status in database is COMPLETED
    const completedOrder = await prisma.order.findUnique({
      where: { id: createdOrderId },
    });
    expect(completedOrder?.status).toBe('COMPLETED');

    // Verify balance increased by plan's credits
    const afterCreditsRes = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(afterCreditsRes.body.balance).toBe(
      initialBalance + creditsForActivePlan,
    );
    expect(afterCreditsRes.body.history.length).toBeGreaterThanOrEqual(1);

    const latestMovement = afterCreditsRes.body.history[0];
    expect(latestMovement.amount).toBe(creditsForActivePlan);
    expect(latestMovement.type).toBe('PLAN_SUBSCRIPTION');
  });

  it('4. POST /api/v1/payments/paypal/capture-order idempotently handles repeat captures without double crediting (200 OK)', async () => {
    // Current balance before duplicate capture
    const beforeRes = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const balanceBefore = beforeRes.body.balance;
    const historyCountBefore = beforeRes.body.history.length;

    // Repeat capture of the already completed order
    const duplicateRes = await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/capture-order')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        orderId: createdOrderId,
        paypalOrderId: createdPaypalOrderId,
      })
      .expect(200);

    expect(duplicateRes.body.alreadyCompleted).toBe(true);
    expect(duplicateRes.body.order.status).toBe('COMPLETED');

    // Verify balance and history count remained identical
    const afterRes = await request(app.getHttpServer())
      .get('/api/v1/me/credits')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(afterRes.body.balance).toBe(balanceBefore);
    expect(afterRes.body.history.length).toBe(historyCountBefore);
  });

  it('5. POST /api/v1/payments/paypal/* without authorization returns 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/create-order')
      .send({ planId: activePlanId })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/payments/paypal/capture-order')
      .send({
        orderId: createdOrderId,
        paypalOrderId: createdPaypalOrderId,
      })
      .expect(401);
  });
});
