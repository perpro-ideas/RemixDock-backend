import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/common/mail/mail.service';
import { PrismaService } from '../src/database/prisma.service';

describe('Password Reset Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailService: MailService;

  const testUser = {
    email: 'reset_test_user@remixdock.com',
    username: 'reset_tester',
    password: 'InitialPassword123!',
  };

  let registeredUserId: string;
  let capturedRawToken: string;

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
    mailService = app.get(MailService);

    // Clean up any residual test data
    await prisma.passwordResetToken.deleteMany({
      where: {
        user: {
          email: testUser.email,
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testUser.email },
          { username: testUser.username },
        ],
      },
    });

    await app.init();

    // Register user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);
    registeredUserId = regRes.body.id;

    // Login to obtain active session and hashedRefreshToken
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    const userWithSession = await prisma.user.findUnique({
      where: { id: registeredUserId },
    });
    expect(userWithSession?.hashedRefreshToken).toBeTruthy();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.passwordResetToken.deleteMany({
        where: {
          user: {
            email: testUser.email,
          },
        },
      });
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

  it('1. Forgot password with non-existing email -> 200 OK with generic message (prevents user enumeration)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'non_existing_dj@remixdock.com' })
      .expect(200);

    expect(response.body.message).toBe(
      'Si el correo electrónico está registrado, recibirás un enlace para restablecer tu contraseña.',
    );
  });

  it('2. Forgot password with valid email -> 200 OK, token hashed in DB and email sent', async () => {
    const sendEmailSpy = jest.spyOn(mailService, 'sendPasswordResetEmail');

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: testUser.email })
      .expect(200);

    expect(response.body.message).toBe(
      'Si el correo electrónico está registrado, recibirás un enlace para restablecer tu contraseña.',
    );

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendEmailSpy).toHaveBeenCalledWith(testUser.email, expect.any(String));

    capturedRawToken = sendEmailSpy.mock.calls[0][1];
    expect(capturedRawToken).toHaveLength(64); // 32 bytes hex = 64 characters

    const expectedHash = crypto
      .createHash('sha256')
      .update(capturedRawToken)
      .digest('hex');

    // Verify token stored in DB is the SHA-256 hash, never raw token
    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: expectedHash },
    });

    expect(tokenRecord).toBeDefined();
    expect(tokenRecord?.userId).toBe(registeredUserId);
    expect(tokenRecord?.usedAt).toBeNull();
    expect(tokenRecord?.tokenHash).not.toBe(capturedRawToken);
    expect(tokenRecord?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('3. Reset password with valid token and new password -> 200 OK, updates password and revokes session', async () => {
    const newPassword = 'BrandNewPassword123!';

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: capturedRawToken,
        newPassword,
      })
      .expect(200);

    expect(response.body.message).toBe(
      'Tu contraseña ha sido restablecida exitosamente. Ahora puedes iniciar sesión.',
    );

    // Verify token is now marked as used in DB
    const expectedHash = crypto
      .createHash('sha256')
      .update(capturedRawToken)
      .digest('hex');

    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: expectedHash },
    });
    expect(tokenRecord?.usedAt).toBeInstanceOf(Date);

    // Verify user session was revoked (hashedRefreshToken = null)
    const userInDb = await prisma.user.findUnique({
      where: { id: registeredUserId },
    });
    expect(userInDb?.hashedRefreshToken).toBeNull();
  });

  it('4. Reusing consumed token -> 400 Bad Request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: capturedRawToken,
        newPassword: 'AnotherNewPassword123!',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'El enlace de recuperación es inválido o ha expirado',
    );
  });

  it('5. Reset password with altered or expired token -> 400 Bad Request', async () => {
    // 5.1 Altered token
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: 'altered_tampered_token_signature_1234567890',
        newPassword: 'Password12345!',
      })
      .expect(400);

    // 5.2 Expired token in DB
    const expiredRawToken = crypto.randomBytes(32).toString('hex');
    const expiredTokenHash = crypto
      .createHash('sha256')
      .update(expiredRawToken)
      .digest('hex');

    await prisma.passwordResetToken.create({
      data: {
        userId: registeredUserId,
        tokenHash: expiredTokenHash,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour in the past
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: expiredRawToken,
        newPassword: 'Password12345!',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'El enlace de recuperación es inválido o ha expirado',
    );
  });

  it('6. Login fails with old password and succeeds with new password', async () => {
    // Old password rejected
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(401);

    // New password accepted
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: 'BrandNewPassword123!',
      })
      .expect(200);

    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.user.email).toBe(testUser.email);
  });
});
