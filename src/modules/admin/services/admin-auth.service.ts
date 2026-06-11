import bcrypt from 'bcryptjs';
import prisma from '../../../core/config/database.js';
import { generateOTP, sendEmail } from '../../../core/utils/email.service.js';
import {
  generateAdminAccessToken,
  generateAdminRefreshToken,
} from '../../../core/admin/admin-auth.utils.js';
import { writeAdminAuditLog } from '../../../core/admin/admin-audit.service.js';

export class AdminAuthService {
  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!admin || admin.status !== 'active') {
      throw new Error('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    await prisma.adminOTP.updateMany({
      where: { adminId: admin.id, type: 'admin_login', isUsed: false },
      data: { isUsed: true },
    });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.adminOTP.create({
      data: {
        adminId: admin.id,
        code,
        type: 'admin_login',
        expiresAt,
      },
    });

    await sendEmail(
      admin.email,
      'Rhinox Pay Admin Login Code',
      `<p>Your admin login verification code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
    );

    return {
      requiresOtp: true,
      email: admin.email,
      message: 'Verification code sent to your email',
    };
  }

  async verifyOtp(email: string, code: string, ipAddress?: string, userAgent?: string) {
    const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!admin || admin.status !== 'active') {
      throw new Error('Invalid verification request');
    }

    const otp = await prisma.adminOTP.findFirst({
      where: {
        adminId: admin.id,
        code,
        type: 'admin_login',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new Error('Invalid or expired verification code');
    }

    await prisma.adminOTP.update({ where: { id: otp.id }, data: { isUsed: true } });

    const accessToken = generateAdminAccessToken(admin.id, admin.role);
    const refreshToken = generateAdminRefreshToken(admin.id, admin.role);
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await prisma.adminSession.create({
      data: {
        adminId: admin.id,
        token: accessToken,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await writeAdminAuditLog({
      adminId: admin.id,
      action: 'login',
      resource: 'admin_auth',
      ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        country: admin.country,
      },
    };
  }

  async resendOtp(email: string) {
    const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!admin || admin.status !== 'active') {
      throw new Error('Invalid email');
    }

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.adminOTP.create({
      data: { adminId: admin.id, code, type: 'admin_login', expiresAt },
    });

    await sendEmail(
      admin.email,
      'Rhinox Pay Admin Login Code',
      `<p>Your admin login verification code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
    );

    return { message: 'Verification code resent' };
  }

  async getMe(adminId: number) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        country: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!admin) throw new Error('Admin not found');
    return admin;
  }

  async logout(adminId: number, token?: string) {
    if (token) {
      await prisma.adminSession.deleteMany({ where: { adminId, token } });
    } else {
      await prisma.adminSession.deleteMany({ where: { adminId } });
    }
    await writeAdminAuditLog({ adminId, action: 'logout', resource: 'admin_auth' });
    return { message: 'Logged out successfully' };
  }
}
