import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { AdminController } from './admin.controller.js';
import { adminAuthMiddleware } from '../../core/middleware/admin-auth.middleware.js';
import { requirePermission } from '../../core/middleware/require-permission.middleware.js';
import { uploadSingle } from '../../core/middleware/upload.middleware.js';

export class AdminModule implements IModule {
  public readonly name = 'admin';
  public readonly path = '/api/admin';
  public readonly router: Router;
  private controller = new AdminController();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const c = this.controller;
    const auth = adminAuthMiddleware;
    const perm = requirePermission;

    // Auth (public)
    this.router.post('/auth/login', c.login);

    // Auth (protected)
    this.router.get('/auth/me', auth, c.me);
    this.router.post('/auth/logout', auth, c.logout);

    // Dashboard
    this.router.get('/dashboard/stats', auth, perm('dashboard.read'), c.dashboardStats);
    this.router.get('/dashboard/charts', auth, perm('dashboard.read'), c.dashboardCharts);
    this.router.get('/dashboard/latest-users', auth, perm('dashboard.read'), c.dashboardLatestUsers);
    this.router.get('/dashboard/wallets', auth, perm('dashboard.read'), c.dashboardWallets);

    // Users
    this.router.get('/users', auth, perm('users.read'), c.listUsers);
    this.router.post('/users', auth, perm('users.write'), c.createUser);
    this.router.post('/users/bulk', auth, perm('users.write'), c.bulkUsers);
    this.router.get('/users/:id', auth, perm('users.read'), c.getUser);
    this.router.patch('/users/:id', auth, perm('users.write'), c.updateUser);
    this.router.get('/users/:id/activities', auth, perm('users.read'), c.userActivities);
    this.router.get('/users/:id/wallets', auth, perm('users.read'), c.userWallets);
    this.router.get('/users/:id/transactions', auth, perm('transactions.read'), c.userTransactions);
    this.router.get('/users/:id/kyc', auth, perm('kyc.read'), c.userKyc);
    this.router.get('/users/:id/p2p', auth, perm('users.read'), c.userP2P);

    // Transactions
    this.router.get('/transactions', auth, perm('transactions.read'), c.listTransactions);
    this.router.get('/transactions/:id', auth, perm('transactions.read'), c.getTransaction);

    // KYC
    this.router.get('/kyc', auth, perm('kyc.read'), c.listKyc);
    this.router.get('/kyc/:userId', auth, perm('kyc.read'), c.getKyc);
    this.router.post('/kyc/:userId/approve', auth, perm('kyc.write'), c.approveKyc);
    this.router.post('/kyc/:userId/reject', auth, perm('kyc.write'), c.rejectKyc);

    // Wallets
    this.router.get('/wallets/overview', auth, perm('wallets.read'), c.walletsOverview);
    this.router.get('/wallets/users', auth, perm('wallets.read'), c.walletsUsers);

    // Exchange / Fees
    this.router.get('/exchange/rates', auth, perm('exchange.read'), c.listRates);
    this.router.post('/exchange/rates', auth, perm('exchange.write'), c.setRate);
    this.router.get('/fees', auth, perm('exchange.read'), c.listFees);
    this.router.post('/fees', auth, perm('exchange.write'), c.createFee);
    this.router.patch('/fees/:id', auth, perm('exchange.write'), c.updateFee);

    // P2P
    this.router.get('/p2p/stats', auth, perm('p2p.read'), c.p2pStats);
    this.router.get('/p2p/ads', auth, perm('p2p.read'), c.listP2PAds);
    this.router.get('/p2p/orders', auth, perm('p2p.read'), c.listP2POrders);
    this.router.patch('/p2p/ads/:id/status', auth, perm('p2p.write'), c.updateP2PAdStatus);
    this.router.patch('/p2p/orders/:id/status', auth, perm('p2p.write'), c.updateP2POrderStatus);
    this.router.get('/p2p/appeals', auth, perm('p2p.read'), c.listAppeals);
    this.router.post('/p2p/appeals/:orderId/resolve', auth, perm('p2p.write'), c.resolveAppeal);
    this.router.get('/p2p/appeals/:orderId/chat', auth, perm('p2p.read'), c.appealChat);
    this.router.get('/p2p/payment-methods/:userId', auth, perm('p2p.read'), c.paymentMethods);

    // Master wallet
    this.router.get('/master-wallets', auth, perm('master_wallet.read'), c.masterWallets);
    this.router.get('/master-wallets/activity', auth, perm('master_wallet.read'), c.masterWalletActivity);

    // Analytics
    this.router.get('/analytics/general', auth, perm('analytics.read'), c.analyticsGeneral);
    this.router.get('/analytics/fraud', auth, perm('analytics.read'), c.analyticsFraud);

    // Rewards
    this.router.get('/rewards/rules', auth, perm('rewards.read'), c.listRewardRules);
    this.router.post('/rewards/rules', auth, perm('rewards.write'), c.createRewardRule);
    this.router.patch('/rewards/rules/:id', auth, perm('rewards.write'), c.updateRewardRule);
    this.router.delete('/rewards/rules/:id', auth, perm('rewards.write'), c.deleteRewardRule);
    this.router.get('/rewards/claims', auth, perm('rewards.read'), c.rewardClaims);

    // Support
    this.router.get('/support/chats', auth, perm('support.read'), c.listSupportChats);
    this.router.get('/support/chats/:id', auth, perm('support.read'), c.getSupportChat);
    this.router.patch('/support/chats/:id/assign', auth, perm('support.write'), c.assignSupportChat);
    this.router.patch('/support/chats/:id/status', auth, perm('support.write'), c.updateSupportStatus);
    this.router.post('/support/chats/:id/messages', auth, perm('support.write'), uploadSingle('image'), c.sendSupportMessage);

    // Notifications / Banners
    this.router.get('/notifications', auth, perm('notifications.read'), c.listNotifications);
    this.router.post('/notifications/send', auth, perm('notifications.write'), c.sendNotification);
    this.router.get('/banners', auth, perm('notifications.read'), c.listBanners);
    this.router.post('/banners', auth, perm('notifications.write'), c.createBanner);
    this.router.patch('/banners/:id', auth, perm('notifications.write'), c.updateBanner);
    this.router.delete('/banners/:id', auth, perm('notifications.write'), c.deleteBanner);

    // Staff
    this.router.get('/staff', auth, perm('staff.read'), c.listStaff);
    this.router.post('/staff', auth, perm('staff.write'), c.createStaff);
    this.router.get('/staff/:id', auth, perm('staff.read'), c.getStaff);
    this.router.patch('/staff/:id', auth, perm('staff.write'), c.updateStaff);
    this.router.delete('/staff/:id', auth, perm('staff.write'), c.deleteStaff);
    this.router.get('/staff/:id/activity', auth, perm('staff.read'), c.staffActivity);
  }
}
