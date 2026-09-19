import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

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
