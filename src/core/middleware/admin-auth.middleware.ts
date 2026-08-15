import type { NextFunction, Request, Response } from 'express';
import { verifyAdminToken } from '../admin/admin-auth.utils.js';
import prisma from '../config/database.js';

export interface AdminRequest extends Request {
  adminId?: number;
  adminRole?: string;
  admin?: {
    id: number;
    email: string;
    role: string;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export const adminAuthMiddleware = async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyAdminToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin token' });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.adminId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!admin || admin.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Admin account inactive or not found' });
    }

    req.adminId = admin.id;
    req.adminRole = admin.role;
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};
