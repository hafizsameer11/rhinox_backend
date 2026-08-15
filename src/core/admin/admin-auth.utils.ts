import jwt from 'jsonwebtoken';

const ADMIN_SECRET =
  process.env.ADMIN_JWT_SECRET ||
  process.env.JWT_SECRET ||
  process.env.ACCESS_TOKEN_SECRET ||
  'admin-secret-key';

export type AdminTokenPayload = {
  adminId: number;
  role: string;
  type?: string;
};

export const generateAdminAccessToken = (adminId: number, role: string): string => {
  return jwt.sign({ adminId, role, type: 'admin_access' }, ADMIN_SECRET, { expiresIn: '8h' });
};

export const generateAdminRefreshToken = (adminId: number, role: string): string => {
  return jwt.sign({ adminId, role, type: 'admin_refresh' }, ADMIN_SECRET, { expiresIn: '7d' });
};

export const verifyAdminToken = (token: string): AdminTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET) as AdminTokenPayload & { type?: string };
    if (decoded.type === 'admin_refresh') return null;
    if (!decoded.adminId) return null;
    return { adminId: Number(decoded.adminId), role: decoded.role, type: decoded.type };
  } catch {
    return null;
  }
};

export const verifyAdminRefreshToken = (token: string): AdminTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET) as AdminTokenPayload & { type?: string };
    if (decoded.type !== 'admin_refresh') return null;
    if (!decoded.adminId) return null;
    return { adminId: Number(decoded.adminId), role: decoded.role, type: decoded.type };
  } catch {
    return null;
  }
};
