import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PayoutMethod,
  PayoutStatus,
  Prisma,
  RemixerEarningType,
  Role,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Remixer Payouts & Admin Moderation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const remixerUser = {
    email: 'remixer_payouts_e2e@remixdock.com',
    username: 'payouts_remixer_e2e',
    password: 'Password12345!',
  };

  const otherRemixerUser = {
    email: 'other_payouts_e2e@remixdock.com',
    username: 'other_payouts_e2e',
    password: 'Password12345!',
  };

  const djUser = {
    email: 'dj_payouts_e2e@remixdock.com',
    username: 'dj_payouts_e2e',
    password: 'Password12345!',
  };

  const adminUser = {
    email: 'admin_payouts_e2e@remixdock.com',
    username: 'admin_payouts_e2e',
    password: 'Password12345!',
  };

  let remixerId: string;
  let remixerToken: string;
  let otherRemixerId: string;
  let otherRemixerToken: string;
  let djToken: string;
  let adminToken: string;
  let payoutId: string;

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

    await app.init();

    // Clean up residual test data
    await prisma.remixerEarning.deleteMany({
      where: {
        remixer: {
          email: {
            in: [
              remixerUser.email,
              otherRemixerUser.email,
              djUser.email,
              adminUser.email,
            ],
          },
        },
      },
    });
    await prisma.payoutRequest.deleteMany({
      where: {
        remixer: {
          email: {
            in: [
              remixerUser.email,
              otherRemixerUser.email,
              djUser.email,
              adminUser.email,
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            remixerUser.email,
            otherRemixerUser.email,
            djUser.email,
            adminUser.email,
          ],
        },
      },
    });

    // 1. Remixer user
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

    // Seed initial earnings balance of 50 credits to remixer
    await prisma.remixerEarning.create({
      data: {
        remixerId,
        amountCredits: new Prisma.Decimal(50),
        type: RemixerEarningType.REMIX_BOUNTY,
        description: 'Saldo inicial de prueba para retiros',
      },
    });

    // 2. Other Remixer user
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(otherRemixerUser)
      .expect(201);
    otherRemixerId = otherRes.body.id;
    await prisma.user.update({
      where: { id: otherRemixerId },
      data: { role: Role.REMIXER },
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: otherRemixerUser.email,
        password: otherRemixerUser.password,
      })
      .expect(200);
    otherRemixerToken = otherLogin.body.accessToken;

    // 3. Regular DJ user
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(djUser)
      .expect(201);
    const djLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: djUser.email, password: djUser.password })
      .expect(200);
    djToken = djLogin.body.accessToken;

    // 4. Admin user
    const adminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(adminUser)
      .expect(201);
    await prisma.user.update({
      where: { id: adminRes.body.id },
      data: { role: Role.ADMIN },
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: adminUser.email, password: adminUser.password })
      .expect(200);
    adminToken = adminLogin.body.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.remixerEarning.deleteMany({
        where: {
          remixer: {
            email: {
              in: [
                remixerUser.email,
                otherRemixerUser.email,
                djUser.email,
                adminUser.email,
              ],
            },
          },
        },
      });
      await prisma.payoutRequest.deleteMany({
        where: {
          remixer: {
            email: {
              in: [
                remixerUser.email,
                otherRemixerUser.email,
                djUser.email,
                adminUser.email,
              ],
            },
          },
        },
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [
              remixerUser.email,
              otherRemixerUser.email,
              djUser.email,
              adminUser.email,
            ],
          },
        },
      });
    }
    await app.close();
  });

  it('1. Access control: 401 Unauthorized for unauthenticated, 403 Forbidden for regular DJ', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/remixer/payouts')
      .send({
        creditsAmount: 20,
        method: PayoutMethod.PAYPAL,
        destinationDetails: { email: 'paypal@remixer.com' },
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/remixer/payouts')
      .set('Authorization', `Bearer ${djToken}`)
      .send({
        creditsAmount: 20,
        method: PayoutMethod.PAYPAL,
        destinationDetails: { email: 'paypal@remixer.com' },
      })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/payouts')
      .set('Authorization', `Bearer ${djToken}`)
      .expect(403);
  });

  it('2. Requesting payout below 20 credits minimum returns 400 Bad Request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/remixer/payouts')
      .set('Authorization', `Bearer ${remixerToken}`)
      .send({
        creditsAmount: 15,
        method: PayoutMethod.PAYPAL,
        destinationDetails: { email: 'paypal@remixer.com' },
      })
      .expect(400);

    const messageStr = Array.isArray(response.body.message)
      ? response.body.message.join(' ')
      : response.body.message;
    expect(messageStr).toContain('El retiro mínimo permitido es de 20 créditos');
  });

  it('3. Requesting payout exceeding available balance returns 400 Bad Request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/remixer/payouts')
      .set('Authorization', `Bearer ${remixerToken}`)
      .send({
        creditsAmount: 100,
        method: PayoutMethod.PAYPAL,
        destinationDetails: { email: 'paypal@remixer.com' },
      })
      .expect(400);

    expect(response.body.message).toContain('Saldo de ganancias insuficiente');
  });

  it('4. Remixer creates valid payout of 25 credits: freezes balance immediately via PAYOUT_DEDUCTION', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/remixer/payouts')
      .set('Authorization', `Bearer ${remixerToken}`)
      .send({
        creditsAmount: 25,
        method: PayoutMethod.PAYPAL,
        destinationDetails: { email: 'paypal@remixer.com' },
      })
      .expect(201);

    expect(response.body.id).toBeDefined();
    payoutId = response.body.id;
    expect(response.body.status).toBe(PayoutStatus.PENDING);
    expect(response.body.creditsAmount).toBe(25);
    expect(response.body.amountFiat).toBe(25);
    expect(response.body.method).toBe(PayoutMethod.PAYPAL);

    // Verify PAYOUT_DEDUCTION was recorded
    const deduction = await prisma.remixerEarning.findFirst({
      where: {
        remixerId,
        payoutRequestId: payoutId,
        type: RemixerEarningType.PAYOUT_DEDUCTION,
      },
    });

    expect(deduction).not.toBeNull();
    expect(Number(deduction?.amountCredits)).toBe(-25);

    // Verify available balance decreased from 50 to 25
    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(dashboard.body.availableBalanceCredits).toBe(25);
    expect(dashboard.body.pendingPayoutCredits).toBe(25);
  });

  it('5. Double-spending prevention: second payout exceeding remainder (e.g. 30 credits when 25 available) fails', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/remixer/payouts')
      .set('Authorization', `Bearer ${remixerToken}`)
      .send({
        creditsAmount: 30,
        method: PayoutMethod.BANK_TRANSFER,
        destinationDetails: { accountHolder: 'DJ Producer', iban: 'US123456789' },
      })
      .expect(400);

    expect(response.body.message).toContain('Saldo de ganancias insuficiente');
  });

  it('6. Remixer gets own payout history and detail by ID', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/remixer/payouts')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(listRes.body.total).toBe(1);
    expect(listRes.body.items[0].id).toBe(payoutId);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/remixer/payouts/${payoutId}`)
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(detailRes.body.id).toBe(payoutId);
    expect(detailRes.body.creditsAmount).toBe(25);
  });

  it('7. Remixer cannot view another remixer payout detail by ID (404 Not Found)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/remixer/payouts/${payoutId}`)
      .set('Authorization', `Bearer ${otherRemixerToken}`)
      .expect(404);
  });

  it('8. Admin lists payouts globally and accesses payout audit detail', async () => {
    const adminList = await request(app.getHttpServer())
      .get('/api/v1/admin/payouts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminList.body.total).toBe(1);
    expect(adminList.body.items[0].remixer.email).toBe(remixerUser.email);

    const adminDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/payouts/${payoutId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminDetail.body.id).toBe(payoutId);
    expect(adminDetail.body.remixer.username).toBe(remixerUser.username);
  });

  it('9. Admin updates status to IN_REVIEW and APPROVED', async () => {
    const inReviewRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${payoutId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: PayoutStatus.IN_REVIEW, adminFeedback: 'Revisando datos de PayPal' })
      .expect(200);

    expect(inReviewRes.body.status).toBe(PayoutStatus.IN_REVIEW);
    expect(inReviewRes.body.adminFeedback).toBe('Revisando datos de PayPal');

    const approvedRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${payoutId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: PayoutStatus.APPROVED })
      .expect(200);

    expect(approvedRes.body.status).toBe(PayoutStatus.APPROVED);
  });

  it('10. Admin rejects payout: immediately issues atomic PAYOUT_REFUND restoring remixer balance', async () => {
    // Remixer requests second payout of 20 credits (available balance drops to 5)
    const secondPayoutRes = await request(app.getHttpServer())
      .post('/api/v1/remixer/payouts')
      .set('Authorization', `Bearer ${remixerToken}`)
      .send({
        creditsAmount: 20,
        method: PayoutMethod.BANK_TRANSFER,
        destinationDetails: { accountHolder: 'DJ Producer', iban: 'INVALID_IBAN' },
      })
      .expect(201);

    const secondPayoutId = secondPayoutRes.body.id;

    const midDashboard = await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);
    expect(midDashboard.body.availableBalanceCredits).toBe(5);

    // Admin rejects second payout due to invalid IBAN
    const rejectRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${secondPayoutId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: PayoutStatus.REJECTED,
        adminFeedback: 'Datos bancarios inválidos o no coincidentes',
      })
      .expect(200);

    expect(rejectRes.body.status).toBe(PayoutStatus.REJECTED);
    expect(rejectRes.body.adminFeedback).toContain('Datos bancarios inválidos');
    expect(rejectRes.body.processedAt).toBeDefined();

    // Verify refund entry was created
    const refundEntry = await prisma.remixerEarning.findFirst({
      where: {
        remixerId,
        payoutRequestId: secondPayoutId,
        type: RemixerEarningType.PAYOUT_REFUND,
      },
    });

    expect(refundEntry).not.toBeNull();
    expect(Number(refundEntry?.amountCredits)).toBe(20);

    // Verify available balance is restored back to 25
    const restoredDashboard = await request(app.getHttpServer())
      .get('/api/v1/remixer/studio/dashboard')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(restoredDashboard.body.availableBalanceCredits).toBe(25);
  });

  it('11. Admin completes first payout: successfully marked as COMPLETED with processedAt', async () => {
    const completeRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${payoutId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: PayoutStatus.COMPLETED, adminFeedback: 'Transferencia PayPal completada' })
      .expect(200);

    expect(completeRes.body.status).toBe(PayoutStatus.COMPLETED);
    expect(completeRes.body.processedAt).toBeDefined();

    // Attempting to modify a completed payout fails with 400 Bad Request
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${payoutId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: PayoutStatus.APPROVED })
      .expect(400);
  });
});
