export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT' | 'SUPPORT';

const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'dashboard.read',
    'users.read',
    'users.write',
    'transactions.read',
    'kyc.read',
    'kyc.write',
    'wallets.read',
    'exchange.read',
    'exchange.write',
    'p2p.read',
    'p2p.write',
    'master_wallet.read',
    'analytics.read',
    'rewards.read',
    'rewards.write',
    'support.read',
    'support.write',
    'notifications.read',
    'notifications.write',
    'staff.read',
    'staff.write',
  ],
  AGENT: [
    'dashboard.read',
    'users.read',
    'kyc.read',
    'support.read',
    'support.write',
    'transactions.read',
  ],
  SUPPORT: [
    'dashboard.read',
    'support.read',
    'support.write',
    'notifications.read',
    'notifications.write',
    'users.read',
  ],
};

export const hasPermission = (role: string, permission: string): boolean => {
  const permissions = ROLE_PERMISSIONS[role as AdminRole] || [];
  if (permissions.includes('*')) return true;
  return permissions.includes(permission);
};

export const canAccess = (role: string, permissions: string[]): boolean => {
  return permissions.some((permission) => hasPermission(role, permission));
};
