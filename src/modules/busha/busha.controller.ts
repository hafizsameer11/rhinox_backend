import { type Request, type Response } from 'express';
import { BushaAppService, BushaProviderError } from '../../services/busha/index.js';
import ApiError from '../../core/utils/ApiError.js';

function userIdFrom(req: Request): number {
  const raw = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
  const userId = Number(raw);
  if (!userId) {
    throw ApiError.unauthorized('Unauthorized');
  }
  return userId;
}

function sendError(res: Response, error: any) {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  if (error instanceof BushaProviderError) {
    const apiError = error.toApiError();
    return res.status(apiError.statusCode).json({
      success: false,
      message: apiError.message,
      provider: error.providerResponse,
    });
  }
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Busha request failed',
  });
}

export class BushaController {
  constructor(private readonly service = new BushaAppService()) {}

  async status(req: Request, res: Response) {
    try {
      const data = await this.service.getStatus(userIdFrom(req));
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async startKyc(req: Request, res: Response) {
    try {
      const data = await this.service.startKyc(userIdFrom(req));
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async wallet(req: Request, res: Response) {
    try {
      const userId = userIdFrom(req);
      const [balances, unified] = await Promise.all([
        this.service.mapBalancesForWallet(userId),
        this.service.mapUnifiedBalances(userId),
      ]);
      return res.json({ success: true, data: { balances, unified } });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async depositAddress(req: Request, res: Response) {
    try {
      const { currency, blockchain } = req.params;
      const data = await this.service.getDepositAddress(userIdFrom(req), currency, blockchain);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async previewBuy(req: Request, res: Response) {
    try {
      const data = await this.service.previewBuy(userIdFrom(req), req.body.sourceAmount, req.body.targetCurrency);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async buy(req: Request, res: Response) {
    try {
      const data = await this.service.executeBuy(userIdFrom(req), req.body.sourceAmount, req.body.targetCurrency);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async previewSell(req: Request, res: Response) {
    try {
      const data = await this.service.previewSell(userIdFrom(req), req.body.sourceCurrency, req.body.sourceAmount);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async sell(req: Request, res: Response) {
    try {
      const data = await this.service.executeSell(
        userIdFrom(req),
        req.body.sourceCurrency,
        req.body.sourceAmount,
        req.body.network
      );
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async receive(req: Request, res: Response) {
    try {
      const data = await this.service.createReceive(userIdFrom(req), req.body);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async previewSend(req: Request, res: Response) {
    try {
      const data = await this.service.previewSend(userIdFrom(req), req.body);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async send(req: Request, res: Response) {
    try {
      const data = await this.service.executeSend(userIdFrom(req), req.body);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async trades(req: Request, res: Response) {
    try {
      const data = await this.service.listTrades(userIdFrom(req));
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async trade(req: Request, res: Response) {
    try {
      const data = await this.service.getTrade(userIdFrom(req), Number(req.params.id));
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }

  async refreshTrade(req: Request, res: Response) {
    try {
      const data = await this.service.refreshTrade(userIdFrom(req), Number(req.params.id));
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  }
}
