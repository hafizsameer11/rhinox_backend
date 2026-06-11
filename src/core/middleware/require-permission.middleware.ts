import type { NextFunction, Response } from 'express';
import { hasPermission } from '../admin/admin-permissions.js';
import type { AdminRequest } from './admin-auth.middleware.js';

export const requirePermission = (...permissions: string[]) => {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    const role = req.adminRole || '';
    const allowed = permissions.some((permission) => hasPermission(role, permission));
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
};
