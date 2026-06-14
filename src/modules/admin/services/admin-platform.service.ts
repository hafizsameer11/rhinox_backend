import prisma from '../../../core/config/database.js';
import {
  buildDateFilter,
  formatUserName,
  paginatedResponse,
  type AdminListQuery,
} from '../../../core/admin/admin-query.helpers.js';

export class AdminSupportService {
  async listChats(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };
    if (query.status && query.status !== 'All') where.status = String(query.status).toLowerCase();
    if (query.search) {
      where.OR = [
        { email: { contains: query.search } },
        { name: { contains: query.search } },
        { reason: { contains: query.search } },
      ];
    }
    if (query.agentId) where.assignedTo = Number(query.agentId);

    const [items, total] = await Promise.all([
      prisma.supportChat.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: { include: { country: true } },
          assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.supportChat.count({ where }),
    ]);

    return paginatedResponse(
      items.map((chat) => ({
        id: chat.id,
        username: chat.name,
        email: chat.email,
        category: chat.reason,
        country: chat.user.country?.code || null,
        status: chat.status,
        agent: chat.assignee ? formatUserName(chat.assignee) : 'Unassigned',
        agentId: chat.assignedTo,
        profilePictureUrl: chat.user?.profilePictureUrl || null,
        date: chat.createdAt,
        updatedAt: chat.updatedAt,
      })),
      total,
      query.page,
      query.limit
    );
  }

  async getChat(id: number) {
    const chat = await prisma.supportChat.findUnique({
      where: { id },
      include: {
        user: { include: { country: true } },
        assignee: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });
    if (!chat) throw new Error('Support chat not found');
    return chat;
  }

  async assignChat(id: number, adminId: number) {
    return prisma.supportChat.update({
      where: { id },
      data: { assignedTo: adminId },
    });
  }

  async updateStatus(id: number, status: string) {
    const data: any = { status };
    if (status === 'resolved') data.resolvedAt = new Date();
    if (status === 'appealed') data.appealedAt = new Date();
    return prisma.supportChat.update({ where: { id }, data });
  }

  async sendMessage(chatId: number, adminId: number, message: string, imageUrl?: string) {
    const chat = await prisma.supportChat.findUnique({ where: { id: chatId } });
    if (!chat) throw new Error('Support chat not found');

    const trimmedMessage = (message || '').trim();
    const normalizedImageUrl = imageUrl?.trim() || null;

    if (!trimmedMessage && !normalizedImageUrl) {
      throw new Error('Message or image is required');
    }

    return prisma.supportMessage.create({
      data: {
        chatId,
        senderId: chat.userId,
        message: trimmedMessage || '[Image attached]',
        imageUrl: normalizedImageUrl,
        isFromSupport: true,
      },
    });
  }
}

export class AdminNotificationsService {
  async list(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };
    const [items, total] = await Promise.all([
      prisma.adminNotification.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { admin: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.adminNotification.count({ where }),
    ]);

    return paginatedResponse(items, total, query.page, query.limit);
  }

  async send(data: {
    title: string;
    message: string;
    countries?: string[];
    userSegment?: string;
    adminId: number;
  }) {
    const users = await prisma.user.findMany({
      where: data.countries?.length
        ? { country: { code: { in: data.countries.map((c) => c.toUpperCase()) } } }
        : {},
      select: { id: true },
    });

    if (users.length) {
      await prisma.notification.createMany({
        data: users.map((user) => ({
          userId: user.id,
          type: 'promotional',
          title: data.title,
          message: data.message,
          status: 'info',
        })),
      });
    }

    return prisma.adminNotification.create({
      data: {
        adminId: data.adminId,
        title: data.title,
        message: data.message,
        countries: data.countries || [],
        userSegment: data.userSegment,
        sentCount: users.length,
      },
    });
  }

  async listBanners(query: AdminListQuery) {
    const [items, total] = await Promise.all([
      prisma.adminBanner.findMany({
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.adminBanner.count(),
    ]);
    return paginatedResponse(items, total, query.page, query.limit);
  }

  async createBanner(data: { imageUrl: string; regions?: string[] }) {
    return prisma.adminBanner.create({
      data: { imageUrl: data.imageUrl, regions: data.regions || [] },
    });
  }

  async updateBanner(id: number, data: Partial<{ imageUrl: string; regions: string[]; isActive: boolean }>) {
    return prisma.adminBanner.update({ where: { id }, data });
  }

  async deleteBanner(id: number) {
    return prisma.adminBanner.delete({ where: { id } });
  }

  async deleteNotification(id: number) {
    return prisma.adminNotification.delete({ where: { id } });
  }
}

export class AdminStaffService {
  async list(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };
    if (query.status && query.status !== 'All') where.status = String(query.status).toLowerCase();
    if (query.role && query.role !== 'All') where.role = String(query.role).toUpperCase();
    if (query.country && query.country !== 'All') where.country = String(query.country).toUpperCase();
    if (query.search) {
      where.OR = [
        { email: { contains: query.search } },
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.adminUser.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          country: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.adminUser.count({ where }),
    ]);

    return paginatedResponse(
      items.map((admin) => ({
        id: admin.id,
        username: formatUserName(admin),
        email: admin.email,
        role: admin.role,
        country: admin.country,
        status: admin.status,
        date: admin.createdAt,
        lastLoginAt: admin.lastLoginAt,
      })),
      total,
      query.page,
      query.limit
    );
  }

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    country?: string;
  }) {
    const bcrypt = await import('bcryptjs');
    return prisma.adminUser.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash: await bcrypt.default.hash(data.password, 10),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role.toUpperCase(),
        country: data.country?.toUpperCase(),
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        country: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async update(id: number, data: Partial<{ firstName: string; lastName: string; role: string; country: string; status: string }>) {
    const payload: any = { ...data };
    if (payload.role) payload.role = payload.role.toUpperCase();
    if (payload.country) payload.country = payload.country.toUpperCase();
    return prisma.adminUser.update({ where: { id }, data: payload });
  }

  async deactivate(id: number) {
    return prisma.adminUser.update({ where: { id }, data: { status: 'inactive' } });
  }

  async getById(id: number) {
    const admin = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        country: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    if (!admin) throw new Error('Admin not found');
    return admin;
  }

  async getActivity(id: number, query: AdminListQuery) {
    const where: any = { adminId: id, ...buildDateFilter(query.from, query.to) };
    if (query.search) where.action = { contains: String(query.search) };

    const [items, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return paginatedResponse(
      items.map((log) => ({
        id: log.id,
        activity: `${log.action} on ${log.resource}`,
        resource: log.resource,
        resourceId: log.resourceId,
        date: log.createdAt,
      })),
      total,
      query.page,
      query.limit
    );
  }
}
