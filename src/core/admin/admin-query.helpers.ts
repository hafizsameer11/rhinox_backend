import type { Request } from 'express';

export type AdminListQuery = {
  page: number;
  limit: number;
  skip: number;
  search?: string;
  range?: string;
  from?: Date;
  to?: Date;
  country?: string;
  status?: string;
  [key: string]: unknown;
};

export const parsePagination = (query: Record<string, unknown>) => {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

export const parseDateRange = (query: Record<string, unknown>) => {
  const range = String(query.range || 'all');
  const now = new Date();
  let from: Date | undefined;
  let to: Date | undefined = now;

  if (range === '7d') {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === '30d' || range === '1 month') {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === '365d' || range === '1 Year') {
    from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  } else if (range === 'custom' && query.from && query.to) {
    from = new Date(String(query.from));
    to = new Date(String(query.to));
  } else if (range !== 'all' && range !== 'All Time') {
    from = undefined;
    to = undefined;
  }

  return { range, from, to };
};

export const buildDateFilter = (from?: Date, to?: Date, field = 'createdAt') => {
  if (!from && !to) return {};
  return {
    [field]: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
};

export const paginatedResponse = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
  stats: Record<string, unknown> = {}
) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  },
  stats,
});

export const parseAdminListQuery = (req: Request): AdminListQuery => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const { range, from, to } = parseDateRange(req.query as Record<string, unknown>);
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const country = req.query.country ? String(req.query.country) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  return {
    ...(req.query as Record<string, unknown>),
    page,
    limit,
    skip,
    search,
    range,
    from,
    to,
    country,
    status,
  } as AdminListQuery;
};

export const formatUserName = (user?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) => {
  if (!user) return '';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || '';
};
