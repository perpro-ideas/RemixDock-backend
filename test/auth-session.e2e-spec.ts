import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Auth Session & Token Lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: 'session_user@remixdock.com',
    username: 'session_dj',
    password: 'UltraSecretPass123!',
  };

  let registeredUserId: string;
  let currentAccessToken: string;
  let currentRefreshTokenCookie: string;
  let currentRefreshTokenValue: string;

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

    // Clean up residual test user data
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testUser.email },
          { username: testUser.username },
        ],
      },
    });

    await app.init();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          OR: [
            { email: testUser.email },
            { username: testUser.username },
          ],
        },
      });
    }
    await app.close();
  });

  it('1. Register initial test user (201 Created)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.email).toBe(testUser.email);
    expect(response.body.username).toBe(testUser.username);
    registeredUserId = response.body.id;
  });

  it('2. Login with email -> 200 OK + accessToken + httpOnly refreshToken cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(typeof response.body.accessToken).toBe('string');
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe(testUser.email);
    expect(response.body.user.passwordHash).toBeUndefined();

    // Verify Set-Cookie header
    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    const cookieHeader = cookies?.[0] ?? '';
    expect(cookieHeader).toContain('refreshToken=');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Path=/api/v1/auth');

    currentAccessToken = response.body.accessToken;
    currentRefreshTokenCookie = cookieHeader;
    currentRefreshTokenValue = extractCookieValue(cookies, 'refreshToken');
    expect(currentRefreshTokenValue).toBeTruthy();

    // Verify database has hashed token, never plain text
    const dbUser = await prisma.user.findUnique({
      where: { id: registeredUserId },
    });
    expect(dbUser?.hashedRefreshToken).toBeDefined();
    expect(dbUser?.hashedRefreshToken).not.toBe(currentRefreshTokenValue);
    expect(dbUser?.hashedRefreshToken?.startsWith('$argon2')).toBe(true);
  });

  it('3. Login with username -> 200 OK with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.username,
        password: testUser.password,
      })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.username).toBe(testUser.username);

    // Update tokens with the latest login
    currentAccessToken = response.body.accessToken;
    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    currentRefreshTokenValue = extractCookieValue(cookies, 'refreshToken');
  });

  it('4. Login with wrong password -> 401 Unauthorized', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: 'IncorrectPassword999!',
      })
      .expect(401);

    expect(response.body.message).toBe('Credenciales inválidas');
  });

  it('5. GET /api/v1/auth/me with Bearer token -> 200 OK + sanitized user profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${currentAccessToken}`)
      .expect(200);

    expect(response.body.id).toBe(registeredUserId);
    expect(response.body.email).toBe(testUser.email);
    expect(response.body.username).toBe(testUser.username);
    expect(response.body.role).toBe('USER');
    expect(response.body.passwordHash).toBeUndefined();
    expect(response.body.hashedRefreshToken).toBeUndefined();
  });

  it('6. GET /api/v1/auth/me without token -> 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
  });

  it('7. POST /api/v1/auth/refresh with valid cookie -> 200 OK, new accessToken & rotated cookie', async () => {
    // Wait 1 second to ensure JWT iat (issued at) timestamp advances
    await new Promise((resolve) => setTimeout(resolve, 1050));

    const oldRefreshToken = currentRefreshTokenValue;

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${currentRefreshTokenValue}`])
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.accessToken).not.toBe(currentAccessToken);
    currentAccessToken = response.body.accessToken;

    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    const newRefreshToken = extractCookieValue(cookies, 'refreshToken');
    expect(newRefreshToken).toBeTruthy();
    expect(newRefreshToken).not.toBe(oldRefreshToken);

    currentRefreshTokenValue = newRefreshToken;

    // Verify DB hash changed to match the new rotated token
    const dbUser = await prisma.user.findUnique({
      where: { id: registeredUserId },
    });
    expect(dbUser?.hashedRefreshToken).toBeDefined();
    expect(dbUser?.hashedRefreshToken?.startsWith('$argon2')).toBe(true);
  });

  it('8. POST /api/v1/auth/refresh with tampered cookie -> 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=tampered.invalid.token.signature'])
      .expect(401);
  });

  it('9. POST /api/v1/auth/logout -> 200 OK, clears cookie & sets DB hashedRefreshToken to null', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${currentAccessToken}`)
      .expect(200);

    expect(response.body.message).toBe('Sesión cerrada exitosamente');

    // Verify cookie was cleared / expired
    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    const cookieHeader = cookies?.[0] ?? '';
    expect(
      cookieHeader.includes('Max-Age=0') ||
        cookieHeader.includes('Expires=Thu, 01 Jan 1970'),
    ).toBe(true);

    // Verify DB hashedRefreshToken is null
    const dbUser = await prisma.user.findUnique({
      where: { id: registeredUserId },
    });
    expect(dbUser?.hashedRefreshToken).toBeNull();
  });

  it('10. POST /api/v1/auth/refresh after logout -> 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${currentRefreshTokenValue}`])
      .expect(403);
  });
});
