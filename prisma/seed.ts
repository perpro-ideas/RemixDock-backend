import { PlanType, PrismaClient, Role, StemType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  // 1. Seed standard users
  const usersToSeed = [
    {
      email: 'admin@remixdock.com',
      username: 'admin',
      plainPassword: 'Admin12345!',
      role: Role.ADMIN,
    },
    {
      email: 'remixer@remixdock.com',
      username: 'dj_remixer',
      plainPassword: 'Remixer12345!',
      role: Role.REMIXER,
    },
    {
      email: 'user@remixdock.com',
      username: 'club_dj',
      plainPassword: 'User12345!',
      role: Role.USER,
    },
  ];

  for (const user of usersToSeed) {
    const passwordHash = await argon2.hash(user.plainPassword);

    const seededUser = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        username: user.username,
        passwordHash,
        role: user.role,
      },
      create: {
        email: user.email,
        username: user.username,
        passwordHash,
        role: user.role,
      },
    });

    console.log(`✅ Seeded user: ${seededUser.email} with role ${seededUser.role}`);
  }

  // 2. Seed subscription plans
  const plansToSeed = [
    {
      id: 'd1000000-0000-4000-a000-000000000001',
      name: 'DJ Starter',
      description: 'Plan mensual básico para DJs emergentes con acceso al catálogo estándar',
      type: PlanType.MONTHLY,
      price: 9.99,
      durationDays: 30,
      creditsIncluded: 15,
      canRequestRemix: false,
      remixRequestsLimit: 0,
      benefitsJson: [
        '15 descargas mensuales en formato WAV/FLAC',
        'Acceso al catálogo general de remixes',
        'Preescucha en streaming sin pérdidas',
        'Soporte estándar por correo',
      ],
      isActive: true,
    },
    {
      id: 'd2000000-0000-4000-a000-000000000002',
      name: 'DJ Pro Club',
      description: 'Plan mensual premium para DJs de club y cabina con stems multipista',
      type: PlanType.MONTHLY,
      price: 19.99,
      durationDays: 30,
      creditsIncluded: 50,
      canRequestRemix: true,
      remixRequestsLimit: 2,
      benefitsJson: [
        '50 descargas mensuales en formato WAV/FLAC',
        'Acceso ilimitado a stems multipista separados',
        'Lanzamientos exclusivos 48 horas antes',
        'Hasta 2 solicitudes mensuales de remixes',
        'Soporte prioritario para cabina',
      ],
      isActive: true,
    },
    {
      id: 'd3000000-0000-4000-a000-000000000003',
      name: 'Pro Producer Anual',
      description: 'Suscripción anual integral con descargas acumulables y atención preferente',
      type: PlanType.YEARLY,
      price: 189.99,
      durationDays: 365,
      creditsIncluded: 700,
      canRequestRemix: true,
      remixRequestsLimit: 5,
      benefitsJson: [
        '700 descargas anuales acumulables',
        'Descarga ilimitada de stems y pistas acapella',
        'Solicitud directa de remixes personalizados',
        'Licencia comercial para sesiones en vivo',
        'Atención preferente vía WhatsApp/Telegram',
      ],
      isActive: true,
    },
    {
      id: 'd4000000-0000-4000-a000-000000000004',
      name: 'Pack 25 Créditos',
      description: 'Paquete de recarga directa sin suscripción mensual ni caducidad',
      type: PlanType.CREDITS_PACK,
      price: 14.99,
      durationDays: 0,
      creditsIncluded: 25,
      canRequestRemix: false,
      remixRequestsLimit: 0,
      benefitsJson: [
        '25 créditos de descarga directa',
        'Sin caducidad mensual',
        'Acceso inmediato a stems',
        'Pago único sin suscripción recurrente',
      ],
      isActive: true,
    },
  ];

  for (const plan of plansToSeed) {
    const existing = await prisma.plan.findFirst({
      where: { name: plan.name },
    });

    const planId = existing ? existing.id : plan.id;

    const seededPlan = await prisma.plan.upsert({
      where: { id: planId },
      update: {
        name: plan.name,
        description: plan.description,
        type: plan.type,
        price: plan.price,
        durationDays: plan.durationDays,
        creditsIncluded: plan.creditsIncluded,
        benefitsJson: plan.benefitsJson,
        canRequestRemix: plan.canRequestRemix,
        remixRequestsLimit: plan.remixRequestsLimit,
        isActive: plan.isActive,
      },
      create: {
        id: planId,
        name: plan.name,
        description: plan.description,
        type: plan.type,
        price: plan.price,
        durationDays: plan.durationDays,
        creditsIncluded: plan.creditsIncluded,
        benefitsJson: plan.benefitsJson,
        canRequestRemix: plan.canRequestRemix,
        remixRequestsLimit: plan.remixRequestsLimit,
        isActive: plan.isActive,
      },
    });

    console.log(`✅ Seeded plan: ${seededPlan.name} (${seededPlan.type} - $${seededPlan.price})`);
  }

  // 3. Seed genres
  const genresToSeed = [
    { name: 'Tech House', slug: 'tech-house' },
    { name: 'Afro House', slug: 'afro-house' },
    { name: 'Latin Urban / Reggaeton', slug: 'latin-urban-reggaeton' },
    { name: 'Electro House', slug: 'electro-house' },
  ];

  const seededGenres = new Map<string, string>();

  for (const genre of genresToSeed) {
    const seeded = await prisma.genre.upsert({
      where: { slug: genre.slug },
      update: { name: genre.name },
      create: { name: genre.name, slug: genre.slug },
    });
    seededGenres.set(genre.slug, seeded.id);
    console.log(`✅ Seeded genre: ${seeded.name} (${seeded.slug})`);
  }

  // 3. Seed sample tracks with stems
  const techHouseId = seededGenres.get('tech-house')!;
  const afroHouseId = seededGenres.get('afro-house')!;
  const latinUrbanId = seededGenres.get('latin-urban-reggaeton')!;

  const tracksToSeed = [
    {
      title: 'Subliminal Groove',
      artist: 'Marco Carola & Solardo',
      remixer: 'RemixDock DJ Team',
      version: 'Extended Club Mix',
      genreId: techHouseId,
      bpm: 126,
      musicalKey: '8A',
      durationSeconds: 384,
      previewAudioUrl: 'https://storage.remixdock.com/previews/subliminal-groove-preview.mp3',
      downloadAudioUrl: 'https://storage.remixdock.com/masters/subliminal-groove-master.wav',
      coverImageUrl: 'https://storage.remixdock.com/covers/subliminal-groove.jpg',
      waveformJson: [0.12, 0.45, 0.78, 0.95, 0.88, 0.75, 0.65, 0.82, 0.91, 0.85],
      creditCost: 1,
      isPublished: true,
      stems: [
        { name: 'Drums & Percussion', type: StemType.DRUMS, audioUrl: 'https://storage.remixdock.com/stems/subliminal-drums.wav', creditCost: 1 },
        { name: 'Sub & Mid Bassline', type: StemType.BASS, audioUrl: 'https://storage.remixdock.com/stems/subliminal-bass.wav', creditCost: 1 },
        { name: 'Vocal Hooks & Chops', type: StemType.VOCALS, audioUrl: 'https://storage.remixdock.com/stems/subliminal-vocals.wav', creditCost: 1 },
        { name: 'Lead Synth & FX', type: StemType.SYNTHS, audioUrl: 'https://storage.remixdock.com/stems/subliminal-synths.wav', creditCost: 1 },
      ],
    },
    {
      title: 'Kilimanjaro Sunset',
      artist: 'Black Coffee & Caiiro',
      remixer: 'DJ Da Capo',
      version: 'VIP Afro Mix',
      genreId: afroHouseId,
      bpm: 122,
      musicalKey: '4A',
      durationSeconds: 420,
      previewAudioUrl: 'https://storage.remixdock.com/previews/kilimanjaro-sunset-preview.mp3',
      downloadAudioUrl: 'https://storage.remixdock.com/masters/kilimanjaro-sunset-master.wav',
      coverImageUrl: 'https://storage.remixdock.com/covers/kilimanjaro-sunset.jpg',
      waveformJson: [0.22, 0.35, 0.58, 0.75, 0.82, 0.9, 0.86, 0.77, 0.68, 0.54],
      creditCost: 2,
      isPublished: true,
      stems: [
        { name: 'Tribal Percussion', type: StemType.DRUMS, audioUrl: 'https://storage.remixdock.com/stems/kilimanjaro-drums.wav', creditCost: 1 },
        { name: 'Ethnic Flute & Marimba', type: StemType.INSTRUMENTS, audioUrl: 'https://storage.remixdock.com/stems/kilimanjaro-flute.wav', creditCost: 1 },
        { name: 'Zulu Chants Acapella', type: StemType.VOCALS, audioUrl: 'https://storage.remixdock.com/stems/kilimanjaro-vocals.wav', creditCost: 1 },
      ],
    },
    {
      title: 'Danza Kuduro',
      artist: 'Don Omar & Lucenzo',
      remixer: 'DJ Hype',
      version: 'Mainstage Bootleg',
      genreId: latinUrbanId,
      bpm: 128,
      musicalKey: '11B',
      durationSeconds: 275,
      previewAudioUrl: 'https://storage.remixdock.com/previews/danza-kuduro-remix-preview.mp3',
      downloadAudioUrl: 'https://storage.remixdock.com/masters/danza-kuduro-remix-master.wav',
      coverImageUrl: 'https://storage.remixdock.com/covers/danza-kuduro-remix.jpg',
      waveformJson: [0.3, 0.65, 0.88, 0.98, 0.92, 0.88, 0.85, 0.95, 0.9, 0.72],
      creditCost: 1,
      isPublished: true,
      stems: [
        { name: 'Dembow & Tech Drums', type: StemType.DRUMS, audioUrl: 'https://storage.remixdock.com/stems/danza-drums.wav', creditCost: 1 },
        { name: 'Rolling Sub Bass', type: StemType.BASS, audioUrl: 'https://storage.remixdock.com/stems/danza-bass.wav', creditCost: 1 },
        { name: 'Clean Lead Vocals', type: StemType.VOCALS, audioUrl: 'https://storage.remixdock.com/stems/danza-vocals.wav', creditCost: 1 },
      ],
    },
  ];

  for (const trackData of tracksToSeed) {
    const existingTrack = await prisma.track.findFirst({
      where: { title: trackData.title, artist: trackData.artist },
    });

    if (!existingTrack) {
      const { stems, ...trackFields } = trackData;
      const createdTrack = await prisma.track.create({
        data: {
          ...trackFields,
          stems: {
            create: stems,
          },
        },
      });
      console.log(`✅ Seeded track: ${createdTrack.title} by ${createdTrack.artist} with ${stems.length} stems`);
    } else {
      console.log(`ℹ️ Track already exists: ${trackData.title}`);
    }
  }

  console.log('🎉 Database seeding completed successfully.');
}

main()
  .catch((e: unknown) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
