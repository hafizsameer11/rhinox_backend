import { BushaAppService } from '../../services/busha/busha.app.service.js';
import { getBushaConfig, isBushaEnabled } from '../../services/busha/busha.config.js';

let started = false;

export function startBushaJobs() {
  if (started || !isBushaEnabled()) return;
  started = true;
  const service = new BushaAppService();
  const config = getBushaConfig();

  setInterval(() => {
    service.retryPendingKyc().catch((error) => console.error('[Busha KYC poller]', error));
  }, config.kycPollMs);

  setInterval(() => {
    service.settleOpenTrades().catch((error) => console.error('[Busha settlement poller]', error));
  }, config.settlementPollMs);

  console.log(
    `Busha jobs started (production=${config.environment === 'production'}) kyc=${config.kycPollMs}ms settle=${config.settlementPollMs}ms`
  );
}
