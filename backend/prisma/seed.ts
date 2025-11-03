import { AssignmentStatus, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.notification.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.workplace.deleteMany();
  await prisma.user.deleteMany();
  await prisma.org.deleteMany();

  const org = await prisma.org.create({
    data: {
      name: 'Armico',
      slug: 'armico',
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@armico.local',
      password: await bcrypt.hash('admin123', 10),
      role: UserRole.SUPER_ADMIN,
      fullName: 'System Administrator',
      orgId: org.id,
    },
  });
  const [hq, support] = await Promise.all([
    prisma.workplace.create({
      data: {
        orgId: org.id,
        code: 'HQ-001',
        name: 'Headquarters',
        location: 'Москва, ул. Арбат, 15',
        isActive: true,
      },
    }),
    prisma.workplace.create({
      data: {
        orgId: org.id,
        code: 'SUP-001',
        name: 'Support Center',
        location: 'Екатеринбург, ул. Ленина, 22',
        isActive: true,
      },
    }),
  ]);

  await prisma.assignment.create({
    data: {
      userId: admin.id,
      workplaceId: hq.id,
      startsAt: new Date(),
      endsAt: null,
      status: AssignmentStatus.ACTIVE,
    },
  });

  console.log('Database has been seeded');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
