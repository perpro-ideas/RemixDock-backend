import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Plans & Catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let remixerToken: string;
  let userToken: string;

  let activePlanId: string;
  let inactivePlanId: string;
  let createdPlanId: string;

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

    // Clean up test plans
    await prisma.plan.deleteMany({
      where: {
        name: {
          in: [
            'Test Active Plan',
            'Test Inactive Plan',
            'Plan Pro DJ E2E',
            'Plan Updated E2E',
          ],
        },
      },
    });

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

    // Authenticate Remixer
    const remixerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'remixer@remixdock.com',
        password: 'Remixer12345!',
      })
      .expect(200);
    remixerToken = remixerLogin.body.accessToken;

    // Authenticate User
    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'user@remixdock.com',
        password: 'User12345!',
      })
      .expect(200);
    userToken = userLogin.body.accessToken;

    // Seed test active and inactive plans
    const activePlan = await prisma.plan.create({
      data: {
        name: 'Test Active Plan',
        description: 'Plan activo para pruebas de catálogo',
        type: 'MONTHLY',
        price: 9.99,
        durationDays: 30,
        creditsIncluded: 50,
        benefitsJson: ['Descargas estándar', 'Soporte DJ'],
        canRequestRemix: false,
        isActive: true,
      },
    });
    activePlanId = activePlan.id;

    const inactivePlan = await prisma.plan.create({
      data: {
        name: 'Test Inactive Plan',
        description: 'Plan deshabilitado para pruebas de visibilidad',
        type: 'MONTHLY',
        price: 19.99,
        durationDays: 30,
        creditsIncluded: 100,
        benefitsJson: ['Descargas VIP'],
        canRequestRemix: true,
        isActive: false,
      },
    });
    inactivePlanId = inactivePlan.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.plan.deleteMany({
        where: {
          name: {
            in: [
              'Test Active Plan',
              'Test Inactive Plan',
              'Plan Pro DJ E2E',
              'Plan Updated E2E',
            ],
          },
        },
      });
    }
    await app.close();
  });

  it('1. GET /api/v1/plans returns only active plans without authentication (200 OK)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/plans')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);

    // Verify all returned plans are active
    const activeIds = response.body.map((p: { id: string }) => p.id);
    expect(activeIds).toContain(activePlanId);
    expect(activeIds).not.toContain(inactivePlanId);

    const activeItem = response.body.find(
      (p: { id: string }) => p.id === activePlanId,
    );
    expect(activeItem.name).toBe('Test Active Plan');
    expect(activeItem.price).toBe(9.99);
    expect(activeItem.benefits).toEqual(['Descargas estándar', 'Soporte DJ']);
    expect(activeItem.isActive).toBe(true);
  });

  it('1.1. GET /api/v1/plans/:id allows public access to active plan but returns 404 for inactive plan', async () => {
    // Active plan -> 200 OK
    const activeRes = await request(app.getHttpServer())
      .get(`/api/v1/plans/${activePlanId}`)
      .expect(200);
    expect(activeRes.body.id).toBe(activePlanId);

    // Inactive plan -> 404 Not Found in public route
    await request(app.getHttpServer())
      .get(`/api/v1/plans/${inactivePlanId}`)
      .expect(404);
  });

  it('2. POST /api/v1/admin/plans as ADMIN creates plan successfully (201 Created)', async () => {
    const newPlanPayload = {
      name: 'Plan Pro DJ E2E',
      description: 'Acceso total para DJs de club y festivales',
      type: 'YEARLY',
      price: 199.99,
      durationDays: 365,
      creditsIncluded: 1200,
      benefits: [
        'Descargas ilimitadas WAV/AIFF',
        'Stems y pistas extendidas',
        'Petición prioritaria de remixes',
      ],
      canRequestRemix: true,
      isActive: true,
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newPlanPayload)
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.name).toBe(newPlanPayload.name);
    expect(response.body.type).toBe(newPlanPayload.type);
    expect(response.body.price).toBe(199.99);
    expect(response.body.creditsIncluded).toBe(1200);
    expect(response.body.benefits).toEqual(newPlanPayload.benefits);
    expect(response.body.canRequestRemix).toBe(true);
    expect(response.body.isActive).toBe(true);

    createdPlanId = response.body.id;
  });

  it('3. POST /api/v1/admin/plans as USER or REMIXER is rejected with 403 Forbidden', async () => {
    const payload = {
      name: 'Plan Unauthorized',
      type: 'MONTHLY',
      price: 15.0,
      durationDays: 30,
      creditsIncluded: 10,
      benefits: ['Beneficio no autorizado'],
    };

    // USER role
    await request(app.getHttpServer())
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${userToken}`)
      .send(payload)
      .expect(403);

    // REMIXER role
    await request(app.getHttpServer())
      .post('/api/v1/admin/plans')
      .set('Authorization', `Bearer ${remixerToken}`)
      .send(payload)
      .expect(403);
  });

  it('4. POST /api/v1/admin/plans without authorization token returns 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/plans')
      .send({
        name: 'Plan No Token',
        type: 'MONTHLY',
        price: 10.0,
        durationDays: 30,
        creditsIncluded: 5,
        benefits: ['Sin token'],
      })
      .expect(401);
  });

  it('5. PATCH /api/v1/admin/plans/:id as ADMIN updates plan price and active status (200 OK)', async () => {
    const updatePayload = {
      name: 'Plan Updated E2E',
      price: 249.99,
      isActive: false,
    };

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/plans/${createdPlanId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(updatePayload)
      .expect(200);

    expect(response.body.id).toBe(createdPlanId);
    expect(response.body.name).toBe('Plan Updated E2E');
    expect(response.body.price).toBe(249.99);
    expect(response.body.isActive).toBe(false);

    // Verify it is no longer returned in public active catalog
    const publicCatalogRes = await request(app.getHttpServer())
      .get('/api/v1/plans')
      .expect(200);

    const publicIds = publicCatalogRes.body.map((p: { id: string }) => p.id);
    expect(publicIds).not.toContain(createdPlanId);
  });
});
