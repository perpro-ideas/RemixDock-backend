import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('User Profile & Password Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser1 = {
    email: 'profile_user1@remixdock.com',
    username: 'profile_user1',
    password: 'InitialPassword123!',
  };

  const testUser2 = {
    email: 'profile_user2@remixdock.com',
    username: 'profile_user2',
    password: 'InitialPassword123!',
  };

  let user1Id: string;
  let user1AccessToken: string;
  let user1RefreshTokenValue: string;

  const extractCookieValue = (cookies: string[] | undefined, name: string): string => {
    if (!cookies) return '';
    for (const cookie of cookies) {
      const match = cookie.match(new RegExp(`^${name}=([^;]+)`));
      if (match) {
        return match[1];
      }
    }
    return '';
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

    // Clean up residual test data
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testUser1.email },
          { username: testUser1.username },
          { username: 'profile_user1_updated' },
          { email: testUser2.email },
          { username: testUser2.username },
        ],
      },
    });

    await app.init();

    // Register User 1
    const regRes1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser1)
      .expect(201);
    user1Id = regRes1.body.id;

    // Register User 2
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser2)
      .expect(201);

    // Login as User 1 to obtain session and tokens
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser1.email,
        password: testUser1.password,
      })
      .expect(200);

    user1AccessToken = loginRes.body.accessToken;
    const cookies = loginRes.headers['set-cookie'] as unknown as string[] | undefined;
    user1RefreshTokenValue = extractCookieValue(cookies, 'refreshToken');
    expect(user1RefreshTokenValue).toBeTruthy();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          OR: [
            { email: testUser1.email },
            { username: testUser1.username },
            { username: 'profile_user1_updated' },
            { email: testUser2.email },
            { username: testUser2.username },
          ],
        },
      });
    }
    await app.close();
  });

  it('1. PATCH /api/v1/users/profile -> 200 OK with updated username and sanitized response', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${user1AccessToken}`)
      .send({ username: 'profile_user1_updated' })
      .expect(200);

    expect(response.body.id).toBe(user1Id);
    expect(response.body.username).toBe('profile_user1_updated');
    expect(response.body.email).toBe(testUser1.email);
    expect(response.body.passwordHash).toBeUndefined();
    expect(response.body.hashedRefreshToken).toBeUndefined();
  });

  it('2. PATCH /api/v1/users/profile with existing duplicate username -> 409 Conflict', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${user1AccessToken}`)
      .send({ username: testUser2.username })
      .expect(409);

    expect(response.body.message).toBe('El nombre de usuario ya está en uso');
  });

  it('3. PATCH /api/v1/users/profile without token -> 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/profile')
      .send({ username: 'unauthorized_attempt' })
      .expect(401);
  });

  it('4. POST /api/v1/users/change-password with invalid current password -> 401 Unauthorized', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${user1AccessToken}`)
      .send({
        currentPassword: 'WrongPassword999!',
        newPassword: 'BrandNewPassword123!',
      })
      .expect(401);

    expect(response.body.message).toBe('La contraseña actual es incorrecta');
  });

  it('5. POST /api/v1/users/change-password with password shorter than 8 chars -> 400 Bad Request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${user1AccessToken}`)
      .send({
        currentPassword: testUser1.password,
        newPassword: 'short',
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('al menos 8 caracteres'),
      ]),
    );
  });

  it('6. POST /api/v1/users/change-password with identical new password -> 400 Bad Request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${user1AccessToken}`)
      .send({
        currentPassword: testUser1.password,
        newPassword: testUser1.password,
      })
      .expect(400);

    expect(response.body.message).toBe(
      'La nueva contraseña debe ser diferente a la actual',
    );
  });

  it('7. POST /api/v1/users/change-password with valid credentials -> 200 OK', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${user1AccessToken}`)
      .send({
        currentPassword: testUser1.password,
        newPassword: 'BrandNewPassword123!',
      })
      .expect(200);

    expect(response.body.message).toBe(
      'Contraseña actualizada exitosamente. Inicie sesión nuevamente.',
    );
  });

  it('8. Verify session revocation in DB and reject old refresh token with 403 Forbidden', async () => {
    // 1. Verify DB hashedRefreshToken is set to null
    const dbUser = await prisma.user.findUnique({
      where: { id: user1Id },
    });
    expect(dbUser?.hashedRefreshToken).toBeNull();

    // 2. Refresh token attempt should be rejected because active sessions were revoked
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${user1RefreshTokenValue}`])
      .expect(403);
  });

  it('9. Verify login succeeds with new password and fails with old password', async () => {
    // Old password fails
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser1.email,
        password: testUser1.password,
      })
      .expect(401);

    // New password succeeds
    const newLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser1.email,
        password: 'BrandNewPassword123!',
      })
      .expect(200);

    expect(newLoginRes.body.accessToken).toBeDefined();
    expect(newLoginRes.body.user.username).toBe('profile_user1_updated');
  });
});
