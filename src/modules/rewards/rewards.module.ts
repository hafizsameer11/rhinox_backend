import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';

export class RewardsModule implements IModule {
  public readonly name = 'rewards';
  public readonly path = '/api/rewards';
  public readonly router: Router;

  private controller: RewardsController;
  private service: RewardsService;

  constructor() {
    this.service = new RewardsService();
    this.controller = new RewardsController(this.service);
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', this.controller.getDashboard.bind(this.controller));
    this.router.get('/history', this.controller.getHistory.bind(this.controller));
    this.router.post('/:rewardCode/claim', this.controller.claimReward.bind(this.controller));
  }
}
