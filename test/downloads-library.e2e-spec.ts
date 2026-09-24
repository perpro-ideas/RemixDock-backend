import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreditEntryType, Role, StemType } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CreditsService } from '../src/modules/credits/credits.service';

describe('Downloads & User Library (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditsService: CreditsService;

  const testUser = {
    email: 'downloads_user_e2e@remixdock.com',
    username: 'downloads_dj_e2e',
    password: 'Password12345!',
    role: Role.USER,
  };

  let testUserId: string;
  let userToken: string;
  let testGenreId: string;
  let testTrackId: string;
  let testStemId: string;
  let testZipTrackId: string;
  let testZeroStemsTrackId: string;
  let testUnpublishedTrackId: string;

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

    await app.init();

    // Clean up residual test data
    await prisma.download.deleteMany({
      where: {
        user: { email: testUser.email },
      },
    });
    await prisma.creditLedgerEntry.deleteMany({
      where: {
        user: { email: testUser.email },
      },
    });
    await prisma.stem.deleteMany({
      where: {
        OR: [
          { name: 'E2E Test Drums Stem' },
          { name: { contains: 'E2E Zip' } },
          { name: 'Secret Drums' },
        ],
      },
    });
    await prisma.track.deleteMany({
      where: {
        OR: [
          { title: 'E2E Downloads Track' },
          { title: 'E2E Zip Stems Track' },
          { title: 'E2E Zero Stems Track' },
          { title: 'E2E Unpublished Track' },
        ],
      },
    });
    await prisma.genre.deleteMany({
      where: { slug: 'e2e-downloads-genre' },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [{ email: testUser.email }, { username: testUser.username }],
      },
    });

    // Create test genre
    const genre = await prisma.genre.create({
      data: {
        name: 'E2E Downloads Genre',
        slug: 'e2e-downloads-genre',
      },
    });
    testGenreId = genre.id;

    // Create test track with 2 creditCost and 1 stem with 1 creditCost
    const track = await prisma.track.create({
      data: {
        title: 'E2E Downloads Track',
        artist: 'Master DJ Producer',
        remixer: 'RemixDock Exclusive',
        version: 'Club Extended',
        genreId: testGenreId,
        bpm: 125,
        musicalKey: '8A',
        durationSeconds: 360,
        previewAudioUrl: 'https://storage.remixdock.com/previews/e2e-track.mp3',
        downloadAudioUrl: 'https://storage.remixdock.com/masters/e2e-track.wav',
        coverImageUrl: 'https://storage.remixdock.com/covers/e2e-track.jpg',
        creditCost: 2,
        isPublished: true,
        stems: {
          create: [
            {
              name: 'E2E Test Drums Stem',
              type: StemType.DRUMS,
              audioUrl: 'https://storage.remixdock.com/stems/e2e-drums.wav',
              creditCost: 1,
            },
          ],
        },
      },
      include: { stems: true },
    });
    testTrackId = track.id;
    testStemId = track.stems[0].id;

    // Create test track specifically for stems ZIP batch download
    const zipTrack = await prisma.track.create({
      data: {
        title: 'E2E Zip Stems Track',
        artist: 'DJ Producer Test',
        remixer: 'RemixDock VIP',
        version: 'Festival Edit',
        genreId: testGenreId,
        bpm: 128,
        musicalKey: '11B',
        durationSeconds: 240,
        previewAudioUrl: 'https://storage.remixdock.com/previews/e2e-zip.mp3',
        downloadAudioUrl: 'https://storage.remixdock.com/masters/e2e-zip.wav',
        coverImageUrl: 'https://storage.remixdock.com/covers/e2e-zip.jpg',
        creditCost: 3,
        isPublished: true,
        stems: {
          create: [
            {
              name: 'E2E Zip Drums',
              type: StemType.DRUMS,
              audioUrl: 'https://storage.remixdock.com/stems/e2e-zip-drums.wav',
              creditCost: 1,
            },
            {
              name: 'E2E Zip Bass',
              type: StemType.BASS,
              audioUrl: 'https://storage.remixdock.com/stems/e2e-zip-bass.wav',
              creditCost: 1,
            },
          ],
        },
      },
      include: { stems: true },
    });
    testZipTrackId = zipTrack.id;

    // Create track with 0 stems to test validation
    const zeroStemsTrack = await prisma.track.create({
      data: {
        title: 'E2E Zero Stems Track',
        artist: 'DJ No Stems',
        version: 'Original Mix',
        genreId: testGenreId,
        bpm: 120,
        musicalKey: '4A',
        durationSeconds: 180,
        previewAudioUrl: 'https://storage.remixdock.com/previews/e2e-no-stems.mp3',
        downloadAudioUrl: 'https://storage.remixdock.com/masters/e2e-no-stems.wav',
        coverImageUrl: 'https://storage.remixdock.com/covers/e2e-no-stems.jpg',
        creditCost: 2,
        isPublished: true,
      },
    });
    testZeroStemsTrackId = zeroStemsTrack.id;

    // Create unpublished track with stems to test exclusivity
    const unpublishedTrack = await prisma.track.create({
      data: {
        title: 'E2E Unpublished Track',
        artist: 'Secret DJ',
        version: 'VIP Mix',
        genreId: testGenreId,
        bpm: 130,
        musicalKey: '1A',
        durationSeconds: 200,
        previewAudioUrl: 'https://storage.remixdock.com/previews/e2e-secret.mp3',
        downloadAudioUrl: 'https://storage.remixdock.com/masters/e2e-secret.wav',
        coverImageUrl: 'https://storage.remixdock.com/covers/e2e-secret.jpg',
        creditCost: 2,
        isPublished: false,
        stems: {
          create: [
            {
              name: 'Secret Drums',
              type: StemType.DRUMS,
              audioUrl: 'https://storage.remixdock.com/stems/secret-drums.wav',
              creditCost: 1,
            },
          ],
        },
      },
    });
    testUnpublishedTrackId = unpublishedTrack.id;

    // Register & login test user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testUser.email,
        username: testUser.username,
        password: testUser.password,
      })
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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.download.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.creditLedgerEntry.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.stem.deleteMany({
        where: {
          OR: [
            { id: testStemId },
            { name: { contains: 'E2E Zip' } },
            { name: 'Secret Drums' },
          ],
        },
      });
      await prisma.track.deleteMany({
        where: {
          OR: [
            { id: testTrackId },
            { id: testZipTrackId },
            { id: testZeroStemsTrackId },
            { id: testUnpublishedTrackId },
          ],
        },
      });
      await prisma.genre.deleteMany({
        where: { id: testGenreId },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }
    await app.close();
  });

  it('1. POST /api/v1/tracks/:id/download without sufficient credits returns 400 Bad Request', async () => {
    // Test user starts with 0 credits, track costs 2 credits
    const currentBalance = await creditsService.getBalance(testUserId);
    expect(currentBalance).toBe(0);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/tracks/${testTrackId}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    expect(response.body.message).toContain('Saldo de créditos insuficiente');
  });

  it('2. POST /api/v1/tracks/:id/download with sufficient credits debits credits and authorizes download (200 OK)', async () => {
    // Add 10 credits to test user
    await creditsService.addEntry(
      testUserId,
      10,
      CreditEntryType.TOPUP_PURCHASE,
      'Recarga de prueba para descargas',
    );

    const balanceBefore = await creditsService.getBalance(testUserId);
    expect(balanceBefore).toBe(10);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/tracks/${testTrackId}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body.downloadUrl).toBe('https://storage.remixdock.com/masters/e2e-track.wav');
    expect(response.body.costCredits).toBe(2);
    expect(response.body.isRedownload).toBe(false);
    expect(response.body.message).toContain('Descarga autorizada y créditos debitados');

    // Verify balance was debited by 2 credits
    const balanceAfter = await creditsService.getBalance(testUserId);
    expect(balanceAfter).toBe(8);

    // Verify download record exists in database
    const downloadRecord = await prisma.download.findFirst({
      where: { userId: testUserId, trackId: testTrackId },
    });
    expect(downloadRecord).not.toBeNull();
    expect(downloadRecord?.costCredits).toBe(2);
  });

  it('3. POST /api/v1/tracks/:id/download re-downloading the same track is free without debiting credits (REM-113)', async () => {
    const balanceBefore = await creditsService.getBalance(testUserId);
    expect(balanceBefore).toBe(8);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/tracks/${testTrackId}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body.downloadUrl).toBe('https://storage.remixdock.com/masters/e2e-track.wav');
    expect(response.body.costCredits).toBe(0);
    expect(response.body.isRedownload).toBe(true);
    expect(response.body.message).toContain('Re-descarga sin costo');

    // Verify balance remains completely unchanged
    const balanceAfter = await creditsService.getBalance(testUserId);
    expect(balanceAfter).toBe(8);
  });

  it('4. POST /api/v1/stems/:id/download acquires individual stem and supports free re-download', async () => {
    const balanceBefore = await creditsService.getBalance(testUserId);
    expect(balanceBefore).toBe(8);

    // First acquisition of stem (costs 1 credit)
    const firstRes = await request(app.getHttpServer())
      .post(`/api/v1/stems/${testStemId}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(firstRes.body.downloadUrl).toBe('https://storage.remixdock.com/stems/e2e-drums.wav');
    expect(firstRes.body.costCredits).toBe(1);
    expect(firstRes.body.isRedownload).toBe(false);

    const balanceMid = await creditsService.getBalance(testUserId);
    expect(balanceMid).toBe(7);

    // Re-download of stem (free)
    const secondRes = await request(app.getHttpServer())
      .post(`/api/v1/stems/${testStemId}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(secondRes.body.downloadUrl).toBe('https://storage.remixdock.com/stems/e2e-drums.wav');
    expect(secondRes.body.costCredits).toBe(0);
    expect(secondRes.body.isRedownload).toBe(true);

    const balanceFinal = await creditsService.getBalance(testUserId);
    expect(balanceFinal).toBe(7);
  });

  it('5. GET /api/v1/me/library returns the acquired tracks and stems in descending order', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/library')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(2);

    // Most recent is the stem download
    const stemItem = response.body.find((item: { type: string }) => item.type === 'STEM');
    expect(stemItem).toBeDefined();
    expect(stemItem.stem.name).toBe('E2E Test Drums Stem');
    expect(stemItem.stem.type).toBe('DRUMS');
    expect(stemItem.downloadUrl).toBe('https://storage.remixdock.com/stems/e2e-drums.wav');
    expect(stemItem.track.title).toBe('E2E Downloads Track');

    // Track download item
    const trackItem = response.body.find((item: { type: string }) => item.type === 'TRACK');
    expect(trackItem).toBeDefined();
    expect(trackItem.track.title).toBe('E2E Downloads Track');
    expect(trackItem.track.artist).toBe('Master DJ Producer');
    expect(trackItem.downloadUrl).toBe('https://storage.remixdock.com/masters/e2e-track.wav');
  });

  it('6. Download and library endpoints return 401 Unauthorized when unauthenticated', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tracks/${testTrackId}/download`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/stems/${testStemId}/download`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/downloads/track/${testTrackId}/stems/zip`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/me/library')
      .expect(401);
  });

  it('7. Download endpoints return 404 Not Found for non-existent track or stem IDs', async () => {
    const nonExistentUuid = '00000000-0000-0000-0000-000000000099';

    await request(app.getHttpServer())
      .post(`/api/v1/tracks/${nonExistentUuid}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/stems/${nonExistentUuid}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/downloads/track/${nonExistentUuid}/stems/zip`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);
  });

  it('8. POST /api/v1/downloads/track/:id/stems/zip returns 400 Bad Request when track has no stems', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/downloads/track/${testZeroStemsTrackId}/stems/zip`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    expect(response.body.message).toContain('Este track no cuenta con stems multipista separados');
  });

  it('9. POST /api/v1/downloads/track/:id/stems/zip returns 404 Not Found when track is unpublished and not acquired', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/downloads/track/${testUnpublishedTrackId}/stems/zip`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);

    expect(response.body.message).toContain('Pista no disponible en el catálogo');
  });

  it('10. POST /api/v1/downloads/track/:id/stems/zip returns 400 Bad Request when user has insufficient credits', async () => {
    // Temporarily update zipTrack to require 100 credits (user currently has 7)
    await prisma.track.update({
      where: { id: testZipTrackId },
      data: { creditCost: 100 },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/downloads/track/${testZipTrackId}/stems/zip`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    expect(response.body.message).toContain('Saldo de créditos insuficiente');

    // Restore original credit cost of 3
    await prisma.track.update({
      where: { id: testZipTrackId },
      data: { creditCost: 3 },
    });
  });

  it('11. POST /api/v1/downloads/track/:id/stems/zip streams ZIP on-the-fly and debits credits on first acquisition', async () => {
    const balanceBefore = await creditsService.getBalance(testUserId);
    expect(balanceBefore).toBe(7);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/downloads/track/${testZipTrackId}/stems/zip`)
      .set('Authorization', `Bearer ${userToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="DJ Producer Test - E2E Zip Stems Track (Festival Edit) - Stems Lossless.zip"',
    );
    expect(response.headers['transfer-encoding']).toBe('chunked');

    // Check magic bytes PK\x03\x04
    expect(Buffer.isBuffer(response.body)).toBe(true);
    const bodyBuffer = response.body as Buffer;
    expect(bodyBuffer.slice(0, 4).toString('hex')).toBe('504b0304');
    expect(bodyBuffer.length).toBeGreaterThan(100);

    // Verify balance was debited by 3 credits (7 -> 4)
    const balanceAfter = await creditsService.getBalance(testUserId);
    expect(balanceAfter).toBe(4);

    // Verify download record exists
    const downloadRecord = await prisma.download.findFirst({
      where: { userId: testUserId, trackId: testZipTrackId },
    });
    expect(downloadRecord).not.toBeNull();
    expect(downloadRecord?.costCredits).toBe(3);
  });

  it('12. POST /api/v1/tracks/:id/stems/zip alias works and re-downloading does not debit credits', async () => {
    const balanceBefore = await creditsService.getBalance(testUserId);
    expect(balanceBefore).toBe(4);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/tracks/${testZipTrackId}/stems/zip`)
      .set('Authorization', `Bearer ${userToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="DJ Producer Test - E2E Zip Stems Track (Festival Edit) - Stems Lossless.zip"',
    );

    const bodyBuffer = response.body as Buffer;
    expect(bodyBuffer.slice(0, 4).toString('hex')).toBe('504b0304');

    // Verify balance remains completely unchanged (4 credits)
    const balanceAfter = await creditsService.getBalance(testUserId);
    expect(balanceAfter).toBe(4);
  });
});

