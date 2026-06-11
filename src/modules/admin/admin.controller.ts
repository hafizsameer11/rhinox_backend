import type { Response } from 'express';
import type { AdminRequest } from '../../core/middleware/admin-auth.middleware.js';
import { parseAdminListQuery } from '../../core/admin/admin-query.helpers.js';
import { writeAdminAuditLog } from '../../core/admin/admin-audit.service.js';
import { AdminAuthService } from './services/admin-auth.service.js';
import { AdminDashboardService, AdminUsersService } from './services/admin-dashboard.service.js';
import { AdminTransactionsService, AdminKycService, AdminWalletsService } from './services/admin-operations.service.js';
import { AdminExchangeService, AdminP2PService } from './services/admin-market.service.js';
import { AdminMasterWalletService, AdminAnalyticsService, AdminRewardsService } from './services/admin-insights.service.js';
import { AdminSupportService, AdminNotificationsService, AdminStaffService } from './services/admin-platform.service.js';

export class AdminController {
  private authService = new AdminAuthService();
  private dashboardService = new AdminDashboardService();
  private usersService = new AdminUsersService();
  private transactionsService = new AdminTransactionsService();
  private kycService = new AdminKycService();
  private walletsService = new AdminWalletsService();
  private exchangeService = new AdminExchangeService();
  private p2pService = new AdminP2PService();
  private masterWalletService = new AdminMasterWalletService();
  private analyticsService = new AdminAnalyticsService();
  private rewardsService = new AdminRewardsService();
  private supportService = new AdminSupportService();
  private notificationsService = new AdminNotificationsService();
  private staffService = new AdminStaffService();

  private async audit(req: AdminRequest, action: string, resource: string, resourceId?: string | number, metadata?: Record<string, unknown>) {
    if (!req.adminId) return;
    await writeAdminAuditLog({
      adminId: req.adminId,
      action,
      resource,
      resourceId,
      metadata,
      ipAddress: req.ip,
    });
  }

  login = async (req: AdminRequest, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await this.authService.login(email, password, req.ip, req.get('user-agent') || undefined);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  verifyOtp = async (req: AdminRequest, res: Response) => {
    try {
      const { email, code } = req.body;
      const result = await this.authService.verifyOtp(email, code, req.ip, req.get('user-agent') || undefined);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  resendOtp = async (req: AdminRequest, res: Response) => {
    try {
      const { email } = req.body;
      const result = await this.authService.resendOtp(email);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  me = async (req: AdminRequest, res: Response) => {
    try {
      const admin = await this.authService.getMe(req.adminId!);
      return res.json({ success: true, data: admin });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  logout = async (req: AdminRequest, res: Response) => {
    try {
      const token = req.headers.authorization?.slice(7);
      const result = await this.authService.logout(req.adminId!, token);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  dashboardStats = async (req: AdminRequest, res: Response) => {
    const data = await this.dashboardService.getStats(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  dashboardCharts = async (req: AdminRequest, res: Response) => {
    const data = await this.dashboardService.getCharts(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  dashboardLatestUsers = async (req: AdminRequest, res: Response) => {
    const limit = parseInt(String(req.query.limit || '10'), 10);
    const data = await this.dashboardService.getLatestUsers(limit);
    return res.json({ success: true, data });
  };

  dashboardWallets = async (req: AdminRequest, res: Response) => {
    const data = await this.dashboardService.getWalletAggregates(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  listUsers = async (req: AdminRequest, res: Response) => {
    const data = await this.usersService.list(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  getUser = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.usersService.getById(Number(req.params.id));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  };

  createUser = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.usersService.create(req.body);
      await this.audit(req, 'create', 'users', data.id);
      return res.status(201).json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  updateUser = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.usersService.update(Number(req.params.id), req.body);
      await this.audit(req, 'update', 'users', req.params.id, req.body);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  bulkUsers = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.usersService.bulkAction(req.body.userIds || [], req.body.action);
      await this.audit(req, 'bulk', 'users', undefined, req.body);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  userActivities = async (req: AdminRequest, res: Response) => {
    const data = await this.usersService.getActivities(Number(req.params.id), parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  userWallets = async (req: AdminRequest, res: Response) => {
    const data = await this.usersService.getUserWallets(Number(req.params.id));
    return res.json({ success: true, data });
  };

  userTransactions = async (req: AdminRequest, res: Response) => {
    const query = parseAdminListQuery(req);
    query.userId = req.params.id;
    const data = await this.transactionsService.list(query);
    return res.json({ success: true, data });
  };

  userKyc = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.kycService.getByUserId(Number(req.params.id));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  };

  userP2P = async (req: AdminRequest, res: Response) => {
    const data = await this.usersService.getUserP2P(Number(req.params.id));
    return res.json({ success: true, data });
  };

  listTransactions = async (req: AdminRequest, res: Response) => {
    const data = await this.transactionsService.list(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  getTransaction = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.transactionsService.getById(Number(req.params.id));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  };

  listKyc = async (req: AdminRequest, res: Response) => {
    const data = await this.kycService.list(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  getKyc = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.kycService.getByUserId(Number(req.params.userId));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  };

  approveKyc = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.kycService.approve(Number(req.params.userId), req.adminId!);
      await this.audit(req, 'approve', 'kyc', req.params.userId);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  rejectKyc = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.kycService.reject(Number(req.params.userId), req.body.reason);
      await this.audit(req, 'reject', 'kyc', req.params.userId, req.body);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  walletsOverview = async (req: AdminRequest, res: Response) => {
    const data = await this.walletsService.getOverview(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  walletsUsers = async (req: AdminRequest, res: Response) => {
    const data = await this.walletsService.listUsers(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  listRates = async (req: AdminRequest, res: Response) => {
    const data = await this.exchangeService.listRates(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  setRate = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.exchangeService.setRate(req.body);
      await this.audit(req, 'set_rate', 'exchange', undefined, req.body);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  };

  listFees = async (req: AdminRequest, res: Response) => {
    const data = await this.exchangeService.listFees(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  createFee = async (req: AdminRequest, res: Response) => {
    const data = await this.exchangeService.createFee(req.body);
    await this.audit(req, 'create', 'fees', data.id, req.body);
    return res.status(201).json({ success: true, data });
  };

  updateFee = async (req: AdminRequest, res: Response) => {
    const data = await this.exchangeService.updateFee(Number(req.params.id), req.body);
    await this.audit(req, 'update', 'fees', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  p2pStats = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.getStats(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  listP2PAds = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.listAds(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  listP2POrders = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.listOrders(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  updateP2PAdStatus = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.updateAdStatus(Number(req.params.id), req.body.status);
    await this.audit(req, 'update_status', 'p2p_ads', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  updateP2POrderStatus = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.updateOrderStatus(Number(req.params.id), req.body.status);
    await this.audit(req, 'update_status', 'p2p_orders', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  listAppeals = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.listAppeals(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  resolveAppeal = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.resolveAppeal(Number(req.params.orderId), req.body.winner);
    await this.audit(req, 'resolve', 'p2p_appeals', req.params.orderId, req.body);
    return res.json({ success: true, data });
  };

  appealChat = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.getAppealChat(Number(req.params.orderId));
    return res.json({ success: true, data });
  };

  paymentMethods = async (req: AdminRequest, res: Response) => {
    const data = await this.p2pService.getPaymentMethods(Number(req.params.userId));
    return res.json({ success: true, data });
  };

  masterWallets = async (req: AdminRequest, res: Response) => {
    const data = await this.masterWalletService.getBalances(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  masterWalletActivity = async (req: AdminRequest, res: Response) => {
    const data = await this.masterWalletService.getActivity(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  analyticsGeneral = async (req: AdminRequest, res: Response) => {
    const data = await this.analyticsService.getGeneral(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  analyticsFraud = async (req: AdminRequest, res: Response) => {
    const data = await this.analyticsService.getFraud(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  listRewardRules = async (req: AdminRequest, res: Response) => {
    const data = await this.rewardsService.listRules(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  createRewardRule = async (req: AdminRequest, res: Response) => {
    const data = await this.rewardsService.createRule(req.body);
    await this.audit(req, 'create', 'reward_rules', data.id, req.body);
    return res.status(201).json({ success: true, data });
  };

  updateRewardRule = async (req: AdminRequest, res: Response) => {
    const data = await this.rewardsService.updateRule(Number(req.params.id), req.body);
    await this.audit(req, 'update', 'reward_rules', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  deleteRewardRule = async (req: AdminRequest, res: Response) => {
    await this.rewardsService.deleteRule(Number(req.params.id));
    await this.audit(req, 'delete', 'reward_rules', req.params.id);
    return res.json({ success: true, data: { deleted: true } });
  };

  rewardClaims = async (req: AdminRequest, res: Response) => {
    const data = await this.rewardsService.listClaims(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  listSupportChats = async (req: AdminRequest, res: Response) => {
    const data = await this.supportService.listChats(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  getSupportChat = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.supportService.getChat(Number(req.params.id));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  };

  assignSupportChat = async (req: AdminRequest, res: Response) => {
    const data = await this.supportService.assignChat(Number(req.params.id), req.body.adminId || req.adminId!);
    await this.audit(req, 'assign', 'support_chats', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  updateSupportStatus = async (req: AdminRequest, res: Response) => {
    const data = await this.supportService.updateStatus(Number(req.params.id), req.body.status);
    await this.audit(req, 'update_status', 'support_chats', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  sendSupportMessage = async (req: AdminRequest, res: Response) => {
    const uploadedFile = (req as any).file as Express.Multer.File | undefined;
    const imageUrl = uploadedFile ? `/uploads/${uploadedFile.filename}` : req.body.imageUrl;
    const data = await this.supportService.sendMessage(
      Number(req.params.id),
      req.adminId!,
      req.body.message,
      imageUrl
    );
    await this.audit(req, 'send_message', 'support_chats', req.params.id);
    return res.json({ success: true, data });
  };

  listNotifications = async (req: AdminRequest, res: Response) => {
    const data = await this.notificationsService.list(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  sendNotification = async (req: AdminRequest, res: Response) => {
    const data = await this.notificationsService.send({ ...req.body, adminId: req.adminId! });
    await this.audit(req, 'send', 'notifications', data.id, req.body);
    return res.status(201).json({ success: true, data });
  };

  listBanners = async (req: AdminRequest, res: Response) => {
    const data = await this.notificationsService.listBanners(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  createBanner = async (req: AdminRequest, res: Response) => {
    const data = await this.notificationsService.createBanner(req.body);
    await this.audit(req, 'create', 'banners', data.id, req.body);
    return res.status(201).json({ success: true, data });
  };

  updateBanner = async (req: AdminRequest, res: Response) => {
    const data = await this.notificationsService.updateBanner(Number(req.params.id), req.body);
    await this.audit(req, 'update', 'banners', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  deleteBanner = async (req: AdminRequest, res: Response) => {
    await this.notificationsService.deleteBanner(Number(req.params.id));
    await this.audit(req, 'delete', 'banners', req.params.id);
    return res.json({ success: true, data: { deleted: true } });
  };

  listStaff = async (req: AdminRequest, res: Response) => {
    const data = await this.staffService.list(parseAdminListQuery(req));
    return res.json({ success: true, data });
  };

  createStaff = async (req: AdminRequest, res: Response) => {
    const data = await this.staffService.create(req.body);
    await this.audit(req, 'create', 'staff', data.id, req.body);
    return res.status(201).json({ success: true, data });
  };

  updateStaff = async (req: AdminRequest, res: Response) => {
    const data = await this.staffService.update(Number(req.params.id), req.body);
    await this.audit(req, 'update', 'staff', req.params.id, req.body);
    return res.json({ success: true, data });
  };

  deleteStaff = async (req: AdminRequest, res: Response) => {
    const data = await this.staffService.deactivate(Number(req.params.id));
    await this.audit(req, 'deactivate', 'staff', req.params.id);
    return res.json({ success: true, data });
  };

  getStaff = async (req: AdminRequest, res: Response) => {
    try {
      const data = await this.staffService.getById(Number(req.params.id));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  };

  staffActivity = async (req: AdminRequest, res: Response) => {
    const data = await this.staffService.getActivity(Number(req.params.id), parseAdminListQuery(req));
    return res.json({ success: true, data });
  };
}
