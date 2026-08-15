/**
 * Create super admin only — safe for production (no tsx, no dist/scripts required).
 *
 * Usage:
 *   npm run seed:admin
 *
 * Optional env:
 *   ADMIN_SEED_EMAIL=admin@rhinoxpay.com
 *   ADMIN_SEED_PASSWORD=Admin@123456
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_SEED_EMAIL || 'admin@rhinoxpay.com').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin@123456';

  const existing = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`Admin already exists: ${adminEmail} (id ${existing.id})`);
    console.log('No changes made.');
    return;
  }

  const admin = await prisma.adminUser.create({
    data: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      country: 'NG',
      status: 'active',
    },
  });

  console.log(`Created super admin: ${admin.email} (id ${admin.id})`);
  console.log(`Password: ${adminPassword}`);
}

main()
  .catch((error) => {
    console.error('Failed to seed admin:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
