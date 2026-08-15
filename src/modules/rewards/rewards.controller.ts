import { type Request, type Response } from 'express';
import { RewardsService } from './rewards.service.js';

export class RewardsController {
  constructor(private service: RewardsService) {}

  async getDashboard(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const data = await this.service.getRewardsDashboard(userId);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load rewards dashboard',
      });
    }
  }

  async getHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const data = await this.service.getRewardsHistory(userId);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load rewards history',
      });
    }
  }

  async claimReward(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const rewardCode = req.params.rewardCode;
      if (!rewardCode) {
        return res.status(400).json({ success: false, message: 'Reward code is required' });
      }

      const data = await this.service.claimReward(userId, rewardCode);
      return res.json({ success: true, data });
    } catch (error: any) {
      const message = error.message || 'Failed to claim reward';
      const statusCode =
        message.includes('not found') || message.includes('not available') || message.includes('already been claimed')
          ? 400
          : 500;
      return res.status(statusCode).json({ success: false, message });
    }
  }
}
