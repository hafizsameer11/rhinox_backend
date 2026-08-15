import prisma from '../config/database.js';

export const writeAdminAuditLog = async (params: {
  adminId: number;
  action: string;
  resource: string;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) => {
  await prisma.adminAuditLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId != null ? String(params.resourceId) : null,
      metadata: (params.metadata as any) || undefined,
      ipAddress: params.ipAddress || null,
    },
  });
};
