/**
 * Create super admin only — does NOT touch currencies, symbols, exchange rates, or user wallets.
 *
 * Usage:
 *   npm run seed:admin
 *   npm run seed:admin:dev
 *
 * Optional env:
 *   ADMIN_SEED_EMAIL=admin@rhinoxpay.com
 *   ADMIN_SEED_PASSWORD=Admin@123456
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/core/config/database.js';

async function main() {
  const adminEmail = (process.env.ADMIN_SEED_EMAIL || 'admin@rhinoxpay.com').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin@123456';

  const existing = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`Admin already exists: ${adminEmail} (id ${existing.id})`);
    console.log('No changes made. Use Settings or a password reset flow to update credentials.');
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
  console.log(`Default password: ${adminPassword}`);
  console.log('Change ADMIN_SEED_PASSWORD before running on production.');
}

main()
  .catch((error) => {
    console.error('Failed to seed admin:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
