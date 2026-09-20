import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StemType } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Music Catalog, DJ Metadata & Stems (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let userToken: string;

  let techHouseGenreId: string;
  let sampleTrackId: string;
  let createdTrackId: string;

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

    // Authenticate Admin
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'admin@remixdock.com',
        password: 'Admin12345!',
      })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    // Authenticate regular user
    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'user@remixdock.com',
        password: 'User12345!',
      })
      .expect(200);
    userToken = userLogin.body.accessToken;

    // Get tech-house genre
    const techGenre = await prisma.genre.findUnique({
      where: { slug: 'tech-house' },
    });
    techHouseGenreId = techGenre?.id ?? '';

    // Get sample track
    const sampleTrack = await prisma.track.findFirst({
      where: { title: 'Subliminal Groove' },
    });
    sampleTrackId = sampleTrack?.id ?? '';
  });

  afterAll(async () => {
    if (prisma && createdTrackId) {
      await prisma.stem.deleteMany({
        where: { trackId: createdTrackId },
      });
      await prisma.track.deleteMany({
        where: { id: createdTrackId },
      });
    }
    await app.close();
  });

  it('1. GET /api/v1/genres returns public list of available genres (200 OK)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/genres')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(4);

    const slugs = response.body.map((g: { slug: string }) => g.slug);
    expect(slugs).toContain('tech-house');
    expect(slugs).toContain('afro-house');
    expect(slugs).toContain('latin-urban-reggaeton');
  });

  it('2. GET /api/v1/tracks returns paginated catalog of published tracks (200 OK)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tracks')
      .expect(200);

    expect(response.body).toBeDefined();
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThanOrEqual(3);
    expect(response.body.total).toBeGreaterThanOrEqual(3);
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(20);

    const firstTrack = response.body.items[0];
    expect(firstTrack.id).toBeDefined();
    expect(firstTrack.title).toBeDefined();
    expect(firstTrack.artist).toBeDefined();
    expect(firstTrack.bpm).toBeDefined();
    expect(firstTrack.musicalKey).toBeDefined();
    expect(firstTrack.previewAudioUrl).toBeDefined();
    expect(firstTrack.genre).toBeDefined();
    expect(firstTrack.isPublished).toBe(true);
  });

  it('3. GET /api/v1/tracks with minBpm and maxBpm filters tracks in musical range (200 OK)', async () => {
    // Range 125 to 127 should only include 126 BPM track (Subliminal Groove)
    const response = await request(app.getHttpServer())
      .get('/api/v1/tracks?minBpm=125&maxBpm=127')
      .expect(200);

    expect(response.body.items.length).toBeGreaterThanOrEqual(1);

    for (const track of response.body.items) {
      expect(track.bpm).toBeGreaterThanOrEqual(125);
      expect(track.bpm).toBeLessThanOrEqual(127);
    }

    const titles = response.body.items.map((t: { title: string }) => t.title);
    expect(titles).toContain('Subliminal Groove');
    expect(titles).not.toContain('Kilimanjaro Sunset'); // 122 BPM
    expect(titles).not.toContain('Danza Kuduro'); // 128 BPM
  });

  it('4. GET /api/v1/tracks with genreSlug filters tracks exclusively by genre (200 OK)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tracks?genreSlug=afro-house')
      .expect(200);

    expect(response.body.items.length).toBeGreaterThanOrEqual(1);

    for (const track of response.body.items) {
      expect(track.genre.slug).toBe('afro-house');
    }

    const titles = response.body.items.map((t: { title: string }) => t.title);
    expect(titles).toContain('Kilimanjaro Sunset');
    expect(titles).not.toContain('Subliminal Groove');
  });

  it('5. GET /api/v1/tracks with text search finds tracks by title, artist or remixer (200 OK)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tracks?search=Solardo')
      .expect(200);

    expect(response.body.items.length).toBeGreaterThanOrEqual(1);
    expect(response.body.items[0].title).toBe('Subliminal Groove');
  });

  it('6. GET /api/v1/tracks/:id returns full track technical details and stems array (200 OK)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/tracks/${sampleTrackId}`)
      .expect(200);

    expect(response.body.id).toBe(sampleTrackId);
    expect(response.body.title).toBe('Subliminal Groove');
    expect(response.body.bpm).toBe(126);
    expect(response.body.musicalKey).toBe('8A');
    expect(response.body.genre.name).toBe('Tech House');
    expect(Array.isArray(response.body.stems)).toBe(true);
    expect(response.body.stems.length).toBe(4);

    const stemTypes = response.body.stems.map((s: { type: string }) => s.type);
    expect(stemTypes).toContain('DRUMS');
    expect(stemTypes).toContain('BASS');
    expect(stemTypes).toContain('VOCALS');
    expect(stemTypes).toContain('SYNTHS');
  });

  it('7. POST /api/v1/admin/tracks without token is rejected with 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/tracks')
      .send({
        title: 'Unauthorized Track',
        artist: 'Unknown',
        genreId: techHouseGenreId,
        bpm: 125,
        musicalKey: '9A',
        durationSeconds: 300,
        previewAudioUrl: 'https://storage.remixdock.com/previews/unauth.mp3',
        downloadAudioUrl: 'https://storage.remixdock.com/masters/unauth.wav',
      })
      .expect(401);
  });

  it('8. POST /api/v1/admin/tracks with regular user token is rejected with 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/tracks')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Forbidden Track',
        artist: 'Regular DJ',
        genreId: techHouseGenreId,
        bpm: 125,
        musicalKey: '9A',
        durationSeconds: 300,
        previewAudioUrl: 'https://storage.remixdock.com/previews/forbidden.mp3',
        downloadAudioUrl: 'https://storage.remixdock.com/masters/forbidden.wav',
      })
      .expect(403);
  });

  it('9. POST /api/v1/admin/tracks with ADMIN token creates track with stems in cascade (201 Created)', async () => {
    const newTrackPayload = {
      title: 'Ibiza Opening Anthem',
      artist: 'Fisher & Chris Lake',
      remixer: 'VIP Festival Mix',
      version: 'VIP Edit',
      genreId: techHouseGenreId,
      bpm: 127,
      musicalKey: '6A',
      durationSeconds: 340,
      previewAudioUrl: 'https://storage.remixdock.com/previews/ibiza-anthem-preview.mp3',
      downloadAudioUrl: 'https://storage.remixdock.com/masters/ibiza-anthem-master.wav',
      coverImageUrl: 'https://storage.remixdock.com/covers/ibiza-anthem.jpg',
      waveformJson: [0.2, 0.4, 0.6, 0.8, 0.9, 0.7, 0.5],
      creditCost: 2,
      isPublished: true,
      stems: [
        {
          name: 'Main Beat & Kick',
          type: StemType.DRUMS,
          audioUrl: 'https://storage.remixdock.com/stems/ibiza-drums.wav',
          creditCost: 1,
        },
        {
          name: 'Dirty Bassline',
          type: StemType.BASS,
          audioUrl: 'https://storage.remixdock.com/stems/ibiza-bass.wav',
          creditCost: 1,
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tracks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newTrackPayload)
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.title).toBe(newTrackPayload.title);
    expect(response.body.bpm).toBe(127);
    expect(response.body.musicalKey).toBe('6A');
    expect(response.body.stemsCount).toBe(2);

    createdTrackId = response.body.id;
  });

  it('10. PATCH /api/v1/admin/tracks/:id as ADMIN updates track metadata (200 OK)', async () => {
    const updatePayload = {
      bpm: 128,
      musicalKey: '6B',
      isPublished: true,
    };

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tracks/${createdTrackId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(updatePayload)
      .expect(200);

    expect(response.body.id).toBe(createdTrackId);
    expect(response.body.bpm).toBe(128);
    expect(response.body.musicalKey).toBe('6B');
  });
});
