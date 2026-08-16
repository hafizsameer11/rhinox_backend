import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { BushaController } from './busha.controller.js';

export class BushaModule implements IModule {
  public readonly name = 'busha';
  public readonly path = '/api/busha';
  public readonly router: Router;
  private readonly controller = new BushaController();

  constructor() {
    this.router = Router();
    this.router.get('/status', this.controller.status.bind(this.controller));
    this.router.get('/kyc/status', this.controller.status.bind(this.controller));
    this.router.post('/kyc/start', this.controller.startKyc.bind(this.controller));
    this.router.get('/wallet', this.controller.wallet.bind(this.controller));
    this.router.get('/pairs', this.controller.pairs.bind(this.controller));
    this.router.get('/currencies/:code', this.controller.currencyLimits.bind(this.controller));
    this.router.get('/deposit-address/:currency/:blockchain', this.controller.depositAddress.bind(this.controller));
    this.router.post('/buy/preview', this.controller.previewBuy.bind(this.controller));
    this.router.post('/buy', this.controller.buy.bind(this.controller));
    this.router.post('/sell/preview', this.controller.previewSell.bind(this.controller));
    this.router.post('/sell', this.controller.sell.bind(this.controller));
    this.router.post('/receive', this.controller.receive.bind(this.controller));
    this.router.post('/send/preview', this.controller.previewSend.bind(this.controller));
    this.router.post('/send', this.controller.send.bind(this.controller));
    this.router.get('/trades', this.controller.trades.bind(this.controller));
    this.router.get('/trades/:id', this.controller.trade.bind(this.controller));
    this.router.post('/trades/:id/refresh', this.controller.refreshTrade.bind(this.controller));
  }
}
