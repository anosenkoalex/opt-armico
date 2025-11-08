import { AssignmentStatus, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Очистка старых данных...');

  // порядок важен из-за внешних ключей
  await prisma.notification.deleteMany();
  await prisma.slot.deleteMany().catch(() => null);
  await prisma.plan.deleteMany().catch(() => null);
  await prisma.assignment.deleteMany();
  await prisma.constraint.deleteMany().catch(() => null);
  await prisma.workplace.deleteMany();
  await prisma.user.deleteMany();
  await prisma.org.deleteMany();
  await prisma.smsSettings.deleteMany().catch(() => null);

  console.log('⚙️ Создание организации и базовых пользователей...');

  const passwordHash = await bcrypt.hash('admin123', 10);

  const org = await prisma.org.create({
    data: {
      name: 'Armico',
      slug: 'armico',
    },
  });

  // админ
  const admin = await prisma.user.create({
    data: {
      email: 'admin@armico.local',
      password: passwordHash,
      role: UserRole.SUPER_ADMIN,
      fullName: 'System Administrator',
      orgId: org.id,
      phone: '+996700000001',
      isSystemUser: false,
    },
  });

  // dev-аккаунт — создаём, но результат нам не нужен, поэтому без const dev
  await prisma.user.create({
    data: {
      email: 'dev@armico.local',
      password: passwordHash,
      role: UserRole.SUPER_ADMIN,
      fullName: 'Developer Account',
      orgId: org.id,
      phone: '+996700000002',
      isSystemUser: true, // скрытый/системный
    },
  });

  console.log('🏢 Создание рабочих мест...');

  // HQ нужно сохранить, чтобы использовать в назначении
  const hq = await prisma.workplace.create({
    data: {
      orgId: org.id,
      code: 'HQ-001',
      name: 'Headquarters',
      location: 'Москва, ул. Арбат, 15',
      isActive: true,
    },
  });

  // второе рабочее место создаём, но переменная не нужна => без const support
  await prisma.workplace.create({
    data: {
      orgId: org.id,
      code: 'SUP-001',
      name: 'Support Center',
      location: 'Екатеринбург, ул. Ленина, 22',
      isActive: true,
    },
  });

  console.log('🧩 Создание назначений...');

  await prisma.assignment.create({
    data: {
      userId: admin.id,
      workplaceId: hq.id,
      startsAt: new Date(),
      endsAt: null,
      status: AssignmentStatus.ACTIVE,
    },
  });

  console.log('📡 Создание тестовых SMS-настроек...');

  await prisma.smsSettings.create({
    data: {
      enabled: false,
      apiUrl: 'https://api.example.com/sms/send',
      apiKey: 'DEMO_KEY',
      sender: 'ARMICO',
    },
  });

  console.log('✅ Database has been seeded successfully!');
  console.log('➡️ Accounts:');
  console.log('   admin@armico.local / admin123');
  console.log('   dev@armico.local / admin123');
}

main()
  .catch((error) => {
    console.error('❌ Ошибка при инициализации базы:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
