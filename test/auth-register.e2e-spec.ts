import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('AuthController - Register (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: 'test_user_register@remixdock.com',
    username: 'test_user_reg',
    password: 'SuperSecretPassword123!',
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

    // Clean up any residual test data
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testUser.email },
          { username: testUser.username },
          { email: 'second_user@remixdock.com' },
          { username: 'second_user' },
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
            { email: 'second_user@remixdock.com' },
            { username: 'second_user' },
          ],
        },
      });
    }
    await app.close();
  });

  it('should register a new user successfully (201) without exposing sensitive fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.id).toBeDefined();
    expect(typeof response.body.id).toBe('string');
    expect(response.body.email).toBe(testUser.email);
    expect(response.body.username).toBe(testUser.username);
    expect(response.body.role).toBe('USER');
    expect(response.body.createdAt).toBeDefined();
    expect(response.body.updatedAt).toBeDefined();

    // Sensitive fields must never be exposed
    expect(response.body.passwordHash).toBeUndefined();
    expect(response.body.hashedRefreshToken).toBeUndefined();
  });

  it('should reject registration when email already exists (409 Conflict)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testUser.email,
        username: 'different_username',
        password: 'Password123!',
      })
      .expect(409);

    expect(response.body.message).toBe('El correo electrónico ya está registrado');
  });

  it('should reject registration when username already exists (409 Conflict)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'second_user@remixdock.com',
        username: testUser.username,
        password: 'Password123!',
      })
      .expect(409);

    expect(response.body.message).toBe('El nombre de usuario ya está en uso');
  });

  it('should reject invalid email format (400 Bad Request)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'invalid-email-format',
        username: 'valid_user',
        password: 'Password123!',
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('correo electrónico')]),
    );
  });

  it('should reject username with less than 3 characters (400 Bad Request)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'valid_email@remixdock.com',
        username: 'ab',
        password: 'Password123!',
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('mínimo 3 caracteres')]),
    );
  });

  it('should reject username with invalid characters (400 Bad Request)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'valid_email@remixdock.com',
        username: 'invalid@user#name',
        password: 'Password123!',
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'El username solo permite caracteres alfanuméricos, guiones y subguiones',
      ]),
    );
  });

  it('should reject password shorter than 8 characters (400 Bad Request)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'valid_email@remixdock.com',
        username: 'valid_user',
        password: '1234567',
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'La contraseña debe tener mínimo 8 caracteres',
      ]),
    );
  });
});
