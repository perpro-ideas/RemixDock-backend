import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('RBAC & Role Protection (e2e)', () => {
  let app: INestApplication;

  let adminToken: string;
  let remixerToken: string;
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
    await app.init();

    // Authenticate Admin
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'admin@remixdock.com',
        password: 'Admin12345!',
      })
      .expect(200);
    adminToken = adminLoginRes.body.accessToken;

    // Authenticate Remixer
    const remixerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'remixer@remixdock.com',
        password: 'Remixer12345!',
      })
      .expect(200);
    remixerToken = remixerLoginRes.body.accessToken;

    // Authenticate User
    const userLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'user@remixdock.com',
        password: 'User12345!',
      })
      .expect(200);
    userToken = userLoginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /api/v1/pings/admin without token -> 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/pings/admin')
      .expect(401);
  });

  it('2. GET /api/v1/pings/remixer without token -> 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/pings/remixer')
      .expect(401);
  });

  it('3. User with role USER accesses /api/v1/pings/admin -> 403 Forbidden', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/pings/admin')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    expect(response.body.message).toBe(
      'Acceso restringido: no cuenta con los permisos de rol requeridos',
    );
  });

  it('4. User with role USER accesses /api/v1/pings/remixer -> 403 Forbidden', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/pings/remixer')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    expect(response.body.message).toBe(
      'Acceso restringido: no cuenta con los permisos de rol requeridos',
    );
  });

  it('5. User with role REMIXER accesses /api/v1/pings/remixer -> 200 OK', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/pings/remixer')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(200);

    expect(response.body.message).toBe('Remixer access granted');
    expect(response.body.user).toBeDefined();
    expect(response.body.user.role).toBe('REMIXER');
    expect(response.body.timestamp).toBeDefined();
  });

  it('6. User with role REMIXER accesses /api/v1/pings/admin -> 403 Forbidden', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/pings/admin')
      .set('Authorization', `Bearer ${remixerToken}`)
      .expect(403);

    expect(response.body.message).toBe(
      'Acceso restringido: no cuenta con los permisos de rol requeridos',
    );
  });

  it('7. User with role ADMIN accesses /api/v1/pings/admin -> 200 OK', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/pings/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.message).toBe('Admin access granted');
    expect(response.body.user).toBeDefined();
    expect(response.body.user.role).toBe('ADMIN');
    expect(response.body.timestamp).toBeDefined();
  });

  it('8. User with role ADMIN accesses /api/v1/pings/remixer -> 200 OK (hierarchy access)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/pings/remixer')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.message).toBe('Remixer access granted');
    expect(response.body.user).toBeDefined();
    expect(response.body.user.role).toBe('ADMIN');
    expect(response.body.timestamp).toBeDefined();
  });
});
