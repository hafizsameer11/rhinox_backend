import { createHmac, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import prisma from '../../core/config/database.js';
import ApiError from '../../core/utils/ApiError.js';
import { PalmPayDepositService } from '../palmpay/palmpay.deposit.service.js';
import { PalmPayPayoutService } from '../palmpay/palmpay.payout.service.js';
import { mapPalmPayStatus } from '../palmpay/palmpay.utils.js';
import { resolveBushaBankCodeFromPalmpay, resolvePalmpayBankCode } from './busha.bank.mapper.js';
import { BushaClient, BushaProviderError } from './busha.client.js';
import { getBushaConfig, isBushaEnabled } from './busha.config.js';
import {
  fromBushaNetwork,
  isCryptoCurrency,
  toBushaCurrency,
  toBushaNetwork,
  getBushaNetworksForCurrency,
  BUSHA_DEPOSIT_CATALOG_FALLBACK,
  shouldPreferStableNetworkDefaults,
} from './busha.networks.js';

const SUCCESS_STATUSES = new Set(['completed', 'funds_converted', 'funds_delivered']);
const FAIL_STATUSES = new Set(['failed', 'cancelled', 'funds_not_delivered', 'funds_refunded']);
const OPEN_TRADE_STATUSES = ['quoted', 'settling', 'awaiting_busha', 'awaiting_crypto_deposit', 'awaiting_palmpay'];

function resolveUploadPath(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;
  const relative = fileUrl.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/uploads\/?/, '');
  const candidates = [
    path.join(process.cwd(), 'uploads', relative),
    path.join('/app/uploads', relative),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function toBase64File(fileUrl?: string | null): string | undefined {
  const diskPath = resolveUploadPath(fileUrl);
  if (!diskPath) return undefined;
  const buffer = readFileSync(diskPath);
  if (buffer.length > 4 * 1024 * 1024) {
    throw ApiError.badRequest('KYC image must be smaller than 4MB for Busha');
  }
  return buffer.toString('base64');
}

function formatBushaDob(date?: Date | string | null): string | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const year = parsed.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function formatBushaPhone(phone?: string | null, countryCode = 'NG'): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (countryCode === 'NG') {
    const local = digits.replace(/^234/, '').replace(/^0/, '');
    return `+234 ${local}`;
  }
  return `+${digits}`;
}

function mapIdType(idType?: string | null): 'national-id' | 'passport' | 'drivers-license' {
  const type = String(idType || '').toLowerCase();
  if (type.includes('passport')) return 'passport';
  if (type.includes('driver')) return 'drivers-license';
  // nin / national_id / voters_card → national-id for Busha
  return 'national-id';
}

async function getOrCreateConfig() {
  return prisma.bushaConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, isActive: true, sellPayoutMode: 'palmpay_temp' },
  });
}

export class BushaAppService {
  constructor(
    private readonly client = new BushaClient(),
    private readonly palmPayPayout = new PalmPayPayoutService(),
    private readonly palmPayDeposit = new PalmPayDepositService()
  ) {}

  async assertPlatformActive() {
    if (!isBushaEnabled()) {
      throw ApiError.serviceUnavailable('Busha is not configured');
    }
    const config = await getOrCreateConfig();
    if (!config.isActive) {
      throw ApiError.serviceUnavailable('Crypto trading is temporarily unavailable');
    }
    return config;
  }

  async getStatus(userId: number) {
    try {
      const platform = await getOrCreateConfig();
      const enabled = isBushaEnabled() && platform.isActive;
      let [user, kyc, customer, latestKycApp] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          include: { country: true },
        }),
        prisma.kYC.findUnique({ where: { userId } }),
        prisma.bushaCustomer.findUnique({ where: { userId } }),
        prisma.bushaKycApplication.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      // Live-check Busha when local customer is not active yet (approval may land on their side first)
      if (enabled && customer?.bushaProfileId && customer.status !== 'active') {
        customer = await this.syncCustomerFromProvider(customer);
        latestKycApp = await prisma.bushaKycApplication.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
      }

      const rhinoxKycReady = Boolean(
        kyc?.status === 'verified' &&
          kyc.firstName &&
          kyc.lastName &&
          kyc.dateOfBirth &&
          kyc.idNumber
      );
      const canTrade = enabled && customer?.status === 'active';

      return {
        isActive: enabled,
        provider: 'busha',
        environment: isBushaEnabled() ? getBushaConfig().environment : null,
        rhinoxKycReady,
        rhinoxKycStatus: kyc?.status || 'not_started',
        bushaStatus: customer?.status || 'missing',
        bushaProfileId: customer?.bushaProfileId || null,
        kycApplicationStatus: latestKycApp?.status || null,
        kycError: latestKycApp?.errorMessage || null,
        needsKyc: enabled && !canTrade,
        canTrade,
        countryCode: user?.country?.code || 'NG',
      };
    } catch (error: any) {
      // Never 500 the wallet crypto tab — return a safe "needs activation" payload.
      console.error('[Busha] getStatus failed:', error?.message || error);
      let environment: string | null = null;
      try {
        if (isBushaEnabled()) environment = getBushaConfig().environment;
      } catch {
        environment = null;
      }
      return {
        isActive: isBushaEnabled(),
        provider: 'busha',
        environment,
        rhinoxKycReady: false,
        rhinoxKycStatus: 'unknown',
        bushaStatus: 'missing',
        bushaProfileId: null,
        kycApplicationStatus: null,
        kycError: error?.message || 'Unable to load crypto status',
        needsKyc: isBushaEnabled(),
        canTrade: false,
        countryCode: 'NG',
      };
    }
  }

  /**
   * Pull latest customer status from Busha and mirror it into our DB.
   */
  async syncCustomerFromProvider(customer: {
    id: number;
    bushaProfileId: string;
    status: string;
  }) {
    try {
      const remote = await this.client.get<any>(`/v1/customers/${customer.bushaProfileId}`);
      const nextStatus = String(remote?.status || customer.status || 'inactive').toLowerCase();

      const updated = await prisma.bushaCustomer.update({
        where: { id: customer.id },
        data: {
          status: nextStatus,
          providerData: remote,
        },
      });

      if (nextStatus === 'active') {
        await prisma.bushaKycApplication.updateMany({
          where: {
            OR: [{ bushaCustomerId: customer.id }, { userId: updated.userId }],
            status: { not: 'active' },
          },
          data: { status: 'active', errorMessage: null, bushaCustomerId: customer.id },
        });
      } else if (nextStatus === 'rejected') {
        await prisma.bushaKycApplication.updateMany({
          where: {
            OR: [{ bushaCustomerId: customer.id }, { userId: updated.userId }],
            status: { in: ['pending', 'processing', 'submitted', 'in_review'] },
          },
          data: { status: 'rejected', bushaCustomerId: customer.id },
        });
      } else if (['in_review', 'pending', 'inactive', 'submitted'].includes(nextStatus)) {
        await prisma.bushaKycApplication.updateMany({
          where: {
            OR: [{ bushaCustomerId: customer.id }, { userId: updated.userId }],
            status: { in: ['pending', 'processing', 'submitted', 'in_review'] },
          },
          data: {
            status: nextStatus === 'inactive' ? 'submitted' : nextStatus === 'pending' ? 'submitted' : nextStatus,
            bushaCustomerId: customer.id,
          },
        });
      }

      if (nextStatus !== customer.status) {
        console.log(
          `[Busha] synced customer ${customer.bushaProfileId}: ${customer.status} → ${nextStatus}`
        );
      }

      return updated;
    } catch (error: any) {
      console.warn(
        `[Busha] sync customer ${customer.bushaProfileId} failed:`,
        error?.message || error
      );
      return prisma.bushaCustomer.findUnique({ where: { id: customer.id } });
    }
  }

  async startKyc(userId: number) {
    await this.assertPlatformActive();
    const existingCustomer = await prisma.bushaCustomer.findUnique({ where: { userId } });
    if (existingCustomer?.status === 'active') {
      return this.getStatus(userId);
    }
    const pendingKyc = await prisma.bushaKycApplication.findFirst({
      where: { userId, status: { in: ['pending', 'processing', 'submitted', 'in_review'] } },
    });
    if (pendingKyc) {
      return this.getStatus(userId);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { country: true, kyc: true },
    });
    if (!user) throw ApiError.notFound('User not found');
    const kyc = user.kyc;
    if (!kyc || kyc.status !== 'verified') {
      throw ApiError.badRequest('Complete Rhinox KYC before activating crypto');
    }
    if (!kyc.firstName || !kyc.lastName || !kyc.dateOfBirth || !kyc.idNumber) {
      throw ApiError.badRequest('KYC is missing name, date of birth, or ID number');
    }

    const application = await prisma.bushaKycApplication.create({
      data: {
        userId,
        rhinoxKycId: kyc.id,
        source: 'rhinox_kyc',
        status: 'pending',
        selfiePath: kyc.faceVerificationImageUrl,
        idDocumentPath: kyc.idDocumentUrl,
      },
    });

    setImmediate(() => {
      this.processKycApplication(application.id).catch((error) => {
        console.error('[Busha KYC] process failed', error);
      });
    });

    return this.getStatus(userId);
  }

  async processKycApplication(applicationId: number) {
    const application = await prisma.bushaKycApplication.findUnique({
      where: { id: applicationId },
      include: { user: { include: { country: true, kyc: true } } },
    });
    if (!application) return;
    if (['submitted', 'in_review', 'active'].includes(application.status)) return;

    await prisma.bushaKycApplication.update({
      where: { id: applicationId },
      data: { status: 'processing', attempts: { increment: 1 }, errorMessage: null },
    });

    try {
      const user = application.user;
      const kyc = user.kyc;
      if (!kyc) throw new Error('Rhinox KYC record missing');

      const countryId = (user.country?.code || 'NG').toUpperCase();
      const birthDate = formatBushaDob(kyc.dateOfBirth);
      const phone = formatBushaPhone(user.phone, countryId);
      const selfie = toBase64File(kyc.faceVerificationImageUrl);
      const idImage = toBase64File(kyc.idDocumentUrl);
      // Nigeria Busha KYC expects national-id (NIN). idNumber holds the NIN from Rhinox KYC.
      const idKind = countryId === 'NG' ? 'national-id' : mapIdType(kyc.idType);
      const idNumber = String(kyc.idNumber || '').trim();

      if (!idNumber) {
        throw new Error('NIN / ID number is required for Busha KYC');
      }

      const identifyingInformation: any[] = [
        {
          type: idKind === 'passport' ? 'passport' : idKind === 'drivers-license' ? 'drivers-license' : 'national-id',
          number: idNumber,
          country: countryId,
          ...(idImage && idKind !== 'national-id' ? { image_front: idImage } : {}),
        },
        {
          type: 'selfie',
          image_front: selfie || '',
          number: '',
          country: countryId,
        },
      ];

      if (!selfie) {
        throw new Error('A selfie image is required for Busha KYC');
      }

      let customer = await prisma.bushaCustomer.findUnique({ where: { userId: user.id } });
      let profile: any;

      if (!customer) {
        profile = await this.client.post('/v1/customers', {
          email: user.email,
          has_accepted_terms: true,
          type: 'individual',
          country_id: countryId,
          phone,
          birth_date: birthDate,
          first_name: kyc.firstName,
          last_name: kyc.lastName,
          middle_name: kyc.middleName || undefined,
          address: {
            city: countryId === 'NG' ? 'Lagos' : 'Nairobi',
            state: countryId === 'NG' ? 'Lagos' : 'Nairobi',
            country_id: countryId,
            address_line_1: 'Registered Rhinox Pay user',
            postal_code: countryId === 'NG' ? '100001' : '00100',
          },
          identifying_information: identifyingInformation,
        });

        customer = await prisma.bushaCustomer.create({
          data: {
            userId: user.id,
            bushaProfileId: profile.id,
            email: user.email,
            firstName: kyc.firstName,
            lastName: kyc.lastName,
            phone,
            countryId,
            birthDate,
            nin: idNumber,
            status: profile.status || 'inactive',
            providerData: profile,
          },
        });
      } else {
        profile = await this.client.put(`/v1/customers/${customer.bushaProfileId}`, {
          email: user.email,
          has_accepted_terms: true,
          type: 'individual',
          country_id: countryId,
          phone,
          birth_date: birthDate,
          first_name: kyc.firstName,
          last_name: kyc.lastName,
          identifying_information: identifyingInformation,
          address: {
            city: countryId === 'NG' ? 'Lagos' : 'Nairobi',
            state: countryId === 'NG' ? 'Lagos' : 'Nairobi',
            country_id: countryId,
            address_line_1: 'Registered Rhinox Pay user',
            postal_code: countryId === 'NG' ? '100001' : '00100',
          },
        });
        customer = await prisma.bushaCustomer.update({
          where: { id: customer.id },
          data: {
            status: profile.status || customer.status,
            providerData: profile,
          },
        });
      }

      await this.client.post(`/v1/customers/${customer.bushaProfileId}/verify`);
      const refreshed = await this.client.get<any>(`/v1/customers/${customer.bushaProfileId}`);
      const nextStatus = refreshed?.status || 'in_review';

      await prisma.bushaCustomer.update({
        where: { id: customer.id },
        data: { status: nextStatus, providerData: refreshed },
      });
      await prisma.bushaKycApplication.update({
        where: { id: applicationId },
        data: {
          bushaCustomerId: customer.id,
          status: nextStatus === 'active' ? 'active' : 'submitted',
        },
      });
    } catch (error: any) {
      const message = error instanceof BushaProviderError ? error.message : error.message || 'Busha KYC failed';
      await prisma.bushaKycApplication.update({
        where: { id: applicationId },
        data: { status: 'failed', errorMessage: message },
      });
      throw error;
    }
  }

  async assertCustomerTradeReady(userId: number) {
    await this.assertPlatformActive();
    let customer = await prisma.bushaCustomer.findUnique({ where: { userId } });
    if (!customer) throw ApiError.badRequest('Activate your crypto wallet first');
    if (customer.status !== 'active' && customer.bushaProfileId) {
      customer = (await this.syncCustomerFromProvider(customer)) || customer;
    }
    if (customer.status !== 'active') {
      throw ApiError.badRequest(`Crypto KYC is ${customer.status}. Trading is available after approval.`);
    }
    return customer;
  }

  async listBalances(userId: number) {
    const customer = await this.assertCustomerTradeReady(userId);
    const balances = await this.client.get<any[]>('/v1/balances', customer.bushaProfileId);
    return (balances || []).filter((item) => item?.type === 'crypto' || isCryptoCurrency(item?.currency));
  }

  private currencyDisplayName(code: string, rawName?: string | null) {
    const DISPLAY_NAMES: Record<string, string> = {
      USDT: 'Tether USD',
      USDC: 'USD Coin',
      BTC: 'Bitcoin',
      ETH: 'Ethereum',
      TRX: 'TRON',
      SOL: 'Solana',
      BNB: 'BNB',
      LTC: 'Litecoin',
      XRP: 'XRP',
      TON: 'TON',
      XLM: 'Stellar',
      SHIB: 'SHIBA INU',
    };
    const raw = String(rawName || '').trim();
    return DISPLAY_NAMES[code] || (raw && !/^tether$/i.test(raw) ? raw : code);
  }

  /**
   * Full Busha crypto/stablecoin catalog (deposit-supported), not only funded balances.
   */
  private mapCatalogFallback() {
    return BUSHA_DEPOSIT_CATALOG_FALLBACK.map((item) => ({
      code: item.code,
      name: this.currencyDisplayName(item.code, item.name),
      networks: item.networks.map((bushaNetwork) => {
        const chain = fromBushaNetwork(bushaNetwork);
        return {
          bushaNetwork,
          id: chain.blockchain,
          blockchain: chain.blockchain,
          blockchainName: chain.blockchainName,
          minDepositAmount: null as string | null,
        };
      }),
    }));
  }

  async listBushaCryptoCatalog(profileId?: string) {
    let remote: any;
    try {
      remote = await this.client.get<any>('/v1/currencies', profileId);
    } catch (error: any) {
      console.warn('[Busha] list currencies failed:', error?.message || error);
      return this.mapCatalogFallback();
    }
    const list = Array.isArray(remote)
      ? remote
      : Array.isArray(remote?.data)
        ? remote.data
        : Array.isArray(remote?.currencies)
          ? remote.currencies
          : [];

    const mapped = list
      .map((item: any) => {
        const code = toBushaCurrency(String(item?.code || item?.currency || ''));
        if (!code || !isCryptoCurrency(code)) return null;
        const type = String(item?.type || '').toLowerCase();
        if (type === 'fiat') return null;
        if (item?.deposit === false) return null;

        const supported = Array.isArray(item?.supported_networks) ? item.supported_networks : [];
        const depositNetworks = supported
          .filter(
            (n: any) =>
              n?.deposit !== false && String(n?.status || 'active').toLowerCase() !== 'disabled'
          )
          .map((n: any) => {
            // Prefer Busha `network` code (ETH/TRX), then id (ethereum / USDT-TRC20), then name
            const rawNet = String(n?.network || n?.id || n?.name || '');
            const bushaNetwork = toBushaNetwork(rawNet, code);
            const chain = fromBushaNetwork(bushaNetwork);
            return {
              bushaNetwork,
              id: String(n?.id || chain.blockchain),
              blockchain: chain.blockchain,
              blockchainName: chain.blockchainName,
              minDepositAmount:
                n?.min_deposit_amount != null && n.min_deposit_amount !== ''
                  ? String(n.min_deposit_amount)
                  : null,
            };
          })
          // Drop unknown / empty mappings; never keep Polygon for USDT
          .filter((n: any) => {
            if (!n.bushaNetwork) return false;
            if (code === 'USDT' && n.bushaNetwork === 'MATIC') return false;
            return true;
          });

        const fallbackNets = getBushaNetworksForCurrency(code).map((bushaNetwork) => {
          const chain = fromBushaNetwork(bushaNetwork);
          return {
            bushaNetwork,
            id: chain.blockchain,
            blockchain: chain.blockchain,
            blockchainName: chain.blockchainName,
            minDepositAmount: null as string | null,
          };
        });

        // Stables: if Busha payload is incomplete or maps to Polygon-only, use known deposit nets
        const networks =
          depositNetworks.length > 0 && !shouldPreferStableNetworkDefaults(code, depositNetworks)
            ? depositNetworks
            : fallbackNets.length > 0
              ? fallbackNets
              : depositNetworks;
        if (!networks.length) return null;

        return {
          code,
          name: this.currencyDisplayName(code, item?.display_name || item?.name),
          networks,
        };
      })
      .filter(Boolean) as Array<{
      code: string;
      name: string;
      networks: Array<{
        bushaNetwork: string;
        id: string;
        blockchain: string;
        blockchainName: string;
        minDepositAmount: string | null;
      }>;
    }>;

    return mapped.length > 0 ? mapped : this.mapCatalogFallback();
  }

  /**
   * List crypto assets available for NGN buy/sell from Busha pairs.
   */
  async listTradeAssets(userId: number) {
    await this.assertPlatformActive();
    const customer = await prisma.bushaCustomer.findUnique({ where: { userId } });
    if (!customer?.bushaProfileId) {
      throw ApiError.badRequest('Activate your crypto wallet first');
    }
    if (customer.status !== 'active') {
      await this.syncCustomerFromProvider(customer);
      const refreshed = await prisma.bushaCustomer.findUnique({ where: { userId } });
      if (refreshed?.status !== 'active') {
        throw ApiError.badRequest('Crypto KYC is still under review. Trading unlocks after approval.');
      }
    }

    let pairs: any[] = [];
    try {
      const remote = await this.client.get<any>(
        '/v1/pairs',
        customer.bushaProfileId,
        { currency: 'NGN' }
      );
      pairs = Array.isArray(remote) ? remote : Array.isArray(remote?.data) ? remote.data : [];
    } catch (error: any) {
      console.warn('[Busha] list pairs failed:', error?.message || error);
      pairs = [];
    }

    const byCode = new Map<
      string,
      {
        code: string;
        name: string;
        pairId: string;
        buySupported: boolean;
        sellSupported: boolean;
        buyPrice: string | null;
        sellPrice: string | null;
        minBuyAmount: string | null;
        minSellAmount: string | null;
        maxBuyAmount: string | null;
        maxSellAmount: string | null;
      }
    >();

    for (const pair of pairs) {
      const base = String(pair?.base || '').toUpperCase();
      const counter = String(pair?.counter || '').toUpperCase();
      if (!base || !counter) continue;

      let cryptoCode = '';
      if (counter === 'NGN' && isCryptoCurrency(base)) cryptoCode = base;
      else if (base === 'NGN' && isCryptoCurrency(counter)) cryptoCode = counter;
      else continue;

      const existing = byCode.get(cryptoCode);
      const buySupported = Boolean(pair?.is_buy_supported ?? pair?.buy_supported ?? true);
      const sellSupported = Boolean(pair?.is_sell_supported ?? pair?.sell_supported ?? true);
      const buyPrice =
        pair?.buy_price?.amount != null
          ? String(pair.buy_price.amount)
          : pair?.buy_price != null
            ? String(pair.buy_price)
            : existing?.buyPrice || null;
      const sellPrice =
        pair?.sell_price?.amount != null
          ? String(pair.sell_price.amount)
          : pair?.sell_price != null
            ? String(pair.sell_price)
            : existing?.sellPrice || null;

      byCode.set(cryptoCode, {
        code: cryptoCode,
        // Prefer ticker for UI; Busha often sends base_name "Tether" which confused the app icon mapper
        name:
          cryptoCode === 'USDT'
            ? 'Tether USD'
            : cryptoCode === 'USDC'
              ? 'USD Coin'
              : pair?.base_name || pair?.counter_name || pair?.name || existing?.name || cryptoCode,
        pairId: String(pair?.id || `${cryptoCode}NGN`),
        buySupported: existing?.buySupported || buySupported,
        sellSupported: existing?.sellSupported || sellSupported,
        buyPrice,
        sellPrice,
        minBuyAmount:
          pair?.min_buy_amount?.amount != null
            ? String(pair.min_buy_amount.amount)
            : existing?.minBuyAmount || null,
        minSellAmount:
          pair?.min_sell_amount?.amount != null
            ? String(pair.min_sell_amount.amount)
            : existing?.minSellAmount || null,
        maxBuyAmount:
          pair?.max_buy_amount?.amount != null
            ? String(pair.max_buy_amount.amount)
            : existing?.maxBuyAmount || null,
        maxSellAmount:
          pair?.max_sell_amount?.amount != null
            ? String(pair.max_sell_amount.amount)
            : existing?.maxSellAmount || null,
      });
    }

    // Fallback so the app still has a usable picker if pairs are empty
    if (byCode.size === 0) {
      for (const code of ['USDT', 'USDC', 'BTC', 'ETH', 'TRX', 'SOL', 'LTC', 'TON', 'XRP', 'BNB']) {
        byCode.set(code, {
          code,
          name: code,
          pairId: `${code}NGN`,
          buySupported: true,
          sellSupported: true,
          buyPrice: null,
          sellPrice: null,
          minBuyAmount: null,
          minSellAmount: null,
          maxBuyAmount: null,
          maxSellAmount: null,
        });
      }
    }

    return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  async getDepositAddress(userId: number, currency: string, blockchain: string) {
    const customer = await this.assertCustomerTradeReady(userId);
    const bushaCurrency = toBushaCurrency(currency);
    const network = toBushaNetwork(blockchain, currency);
    const chain = fromBushaNetwork(network);

    let addressPayload: any;
    try {
      addressPayload = await this.client.get(`/v1/addresses/${bushaCurrency}`, customer.bushaProfileId, {
        network,
      });
    } catch {
      // Busha receive quote requires an amount; use network min deposit when known
      let quoteAmount = bushaCurrency === 'BTC' ? '0.0001' : bushaCurrency === 'ETH' ? '0.001' : '1';
      try {
        const limits = await this.getWithdrawLimits(userId, bushaCurrency);
        const net = this.matchCurrencyNetwork(limits.networks as any[], blockchain, bushaCurrency);
        const minDep = Number((net as any)?.minDepositAmount);
        if (Number.isFinite(minDep) && minDep > 0) {
          quoteAmount = String(minDep);
        }
      } catch {
        /* keep default */
      }
      const receive = await this.createReceive(userId, {
        currency: bushaCurrency,
        amount: quoteAmount,
        network,
      });
      return {
        address: receive.cryptoDepositAddress,
        currency: bushaCurrency,
        blockchain: chain.blockchain,
        network,
        expiresAt: receive.payInExpiresAt,
        provider: 'busha',
        virtualAccountId: receive.cryptoDepositAddress,
        virtualAccountDbId: 0,
        userWalletId: null,
        userWalletBlockchain: chain.blockchain,
        ledger: {
          accountBalance: '0',
          availableBalance: '0',
        },
      };
    }

    const address =
      addressPayload?.address ||
      addressPayload?.data?.address ||
      (Array.isArray(addressPayload) ? addressPayload[0]?.address : null);

    if (!address) {
      throw ApiError.internal('Busha did not return a deposit address');
    }

    return {
      address,
      currency: bushaCurrency,
      blockchain: chain.blockchain,
      network: addressPayload?.network || network,
      memo: addressPayload?.memo || null,
      provider: 'busha',
      virtualAccountId: address,
      virtualAccountDbId: 0,
      userWalletId: null,
      userWalletBlockchain: chain.blockchain,
      ledger: {
        accountBalance: '0',
        availableBalance: '0',
      },
    };
  }

  async tryMapBalancesForWallet(userId: number) {
    try {
      const status = await this.getStatus(userId);
      if (!status.canTrade) return [];
      return await this.mapBalancesForWallet(userId);
    } catch (error) {
      console.warn('[Busha] wallet balances skipped', error instanceof Error ? error.message : error);
      return [];
    }
  }

  async tryMapUnifiedBalances(userId: number) {
    try {
      const status = await this.getStatus(userId);
      if (!status.canTrade) return [];
      return await this.mapUnifiedBalances(userId);
    } catch (error) {
      console.warn('[Busha] unified balances skipped', error instanceof Error ? error.message : error);
      return [];
    }
  }

  async mapVirtualAccounts(userId: number) {
    const rows = await this.tryMapBalancesForWallet(userId);
    return rows.map((row, index) => ({
      id: row.id || index,
      userId,
      blockchain: row.blockchain,
      currency: row.currency,
      accountId: `busha_${row.currency}_${row.blockchain}`,
      accountCode: row.currency,
      active: true,
      frozen: false,
      accountBalance: row.balance,
      availableBalance: row.availableBalance,
      walletCurrency: {
        id: 0,
        blockchain: row.blockchain,
        currency: row.currency,
        symbol: row.symbol,
        name: row.currencyName,
        isToken: row.isToken,
        contractAddress: null,
        decimals: 8,
      },
      depositAddresses: [],
    }));
  }

  async mapBalancesForWallet(userId: number) {
    const customer = await this.assertCustomerTradeReady(userId);
    const [balances, catalog] = await Promise.all([
      this.listBalances(userId),
      this.listBushaCryptoCatalog(customer.bushaProfileId),
    ]);

    const balanceByCode = new Map<string, any>();
    for (const item of balances) {
      const currency = toBushaCurrency(item.currency);
      const available = item.available?.amount || item.available || '0';
      const total = item.total?.amount || item.total || available;
      balanceByCode.set(currency, {
        available: String(available),
        total: String(total),
        name: item.name,
        id: item.id,
      });
    }

    const ordered =
      catalog.length > 0
        ? [
            ...catalog.map((c) => c.code),
            ...Array.from(balanceByCode.keys()).filter((c) => !catalog.some((x) => x.code === c)),
          ]
        : Array.from(balanceByCode.keys());

    return ordered.map((currency, index) => {
      const bal = balanceByCode.get(currency);
      const meta = catalog.find((c) => c.code === currency);
      const chain = fromBushaNetwork(
        meta?.networks?.[0]?.bushaNetwork || (currency === 'USDT' ? 'TRX' : currency)
      );
      const total = bal?.total || '0';
      const available = bal?.available || '0';
      return {
        id: bal?.id || index,
        type: 'crypto' as const,
        currency,
        blockchain: chain.blockchain,
        currencyName: meta?.name || this.currencyDisplayName(currency, bal?.name),
        symbol: currency,
        balance: String(total),
        lockedBalance: '0',
        availableBalance: String(available),
        balanceInUSDT: currency === 'USDT' ? String(total) : '0',
        priceInUSDT: currency === 'USDT' ? '1' : '0',
        icon: null,
        isToken: ['USDT', 'USDC'].includes(currency),
        active: true,
        frozen: false,
        provider: 'busha',
        depositNetworks: meta?.networks || [],
      };
    });
  }

  async mapUnifiedBalances(userId: number) {
    // mapBalancesForWallet already merges Busha catalog + funded balances
    const rows = await this.mapBalancesForWallet(userId);
    const catalogByCode = new Map(
      rows
        .filter((r) => Array.isArray((r as any).depositNetworks))
        .map((r) => [
          r.symbol,
          {
            code: r.symbol,
            name: r.currencyName,
            networks: (r as any).depositNetworks as Array<{
              bushaNetwork: string;
              id: string;
              blockchain: string;
              blockchainName: string;
              minDepositAmount: string | null;
            }>,
          },
        ])
    );

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.symbol) || [];
      list.push(row);
      grouped.set(row.symbol, list);
    }

    return Array.from(grouped.entries())
      .map(([symbol, networks]) => {
        const totalBalance = networks
          .reduce((sum, item) => sum + Number(item.balance || 0), 0)
          .toString();
        const totalAvailable = networks
          .reduce((sum, item) => sum + Number(item.availableBalance || 0), 0)
          .toString();
        const isUnifiedStable = symbol === 'USDT' || symbol === 'USDC';
        const catalogNets = catalogByCode.get(symbol)?.networks;
        const bushaNetworks =
          catalogNets && catalogNets.length > 0
            ? catalogNets.map((n) => n.bushaNetwork)
            : getBushaNetworksForCurrency(symbol);

        const networkRows = bushaNetworks.map((bushaNet) => {
          const chain = fromBushaNetwork(bushaNet);
          const catalogNet = catalogNets?.find((n) => n.bushaNetwork === bushaNet);
          return {
            virtualAccountId: 0,
            currency: symbol,
            blockchain: chain.blockchain,
            blockchainName: catalogNet?.blockchainName || chain.blockchainName,
            balance: totalBalance,
            available: totalAvailable,
            depositAddress: null,
            bushaNetwork: bushaNet,
            minDepositAmount: catalogNet?.minDepositAmount || null,
          };
        });

        return {
          symbol,
          name: catalogByCode.get(symbol)?.name || this.currencyDisplayName(symbol),
          totalBalance,
          totalAvailable,
          isUnifiedStable,
          networks: networkRows,
        };
      })
      .sort((a, b) => {
        const av = Number(a.totalAvailable);
        const bv = Number(b.totalAvailable);
        if (av > 0 && bv <= 0) return -1;
        if (bv > 0 && av <= 0) return 1;
        return a.symbol.localeCompare(b.symbol);
      });
  }

  private async createQuoteAndTransfer(profileId: string, quoteBody: Record<string, any>) {
    const quote = await this.client.post('/v1/quotes', quoteBody, profileId);
    const transfer = await this.client.post('/v1/transfers', { quote_id: quote.id }, profileId);
    return { quote, transfer };
  }

  private async createQuote(profileId: string, quoteBody: Record<string, any>) {
    return this.client.post('/v1/quotes', quoteBody, profileId);
  }

  private async createTransferFromQuote(profileId: string, quoteId: string) {
    return this.client.post('/v1/transfers', { quote_id: quoteId }, profileId);
  }

  /** Create a PalmPay amount-locked VA + Busha NGN bank recipient for sells. */
  private async createPalmPaySellDestination(
    userId: number,
    amountNgn: number,
    bushaProfileId: string
  ) {
    const exactAmount = this.exactNgn(amountNgn);
    if (exactAmount < 100) {
      throw ApiError.badRequest('PalmPay sell VA amount must be at least NGN 100');
    }
    const palmpayOrderId = `busha_sell_${randomUUID().replace(/-/g, '').slice(0, 20)}`.slice(0, 32);
    const va = await this.palmPayDeposit.createVirtualAccountOrder({
      orderId: palmpayOrderId,
      amount: exactAmount,
      userId,
    });
    const palmpayOrderNo = (va as any).orderNo || null;
    const accountNumber =
      (va as any).payerVirtualAccNo || (va as any).virtualAccNo || (va as any).accountNumber;
    const accountName = (va as any).payerAccountName || (va as any).accountName || 'PalmPay';
    const bankName = (va as any).payerBankName || (va as any).bankName || 'PalmPay';
    if (!accountNumber) {
      throw ApiError.internal('PalmPay did not return a virtual account number');
    }
    const bankCode = resolveBushaBankCodeFromPalmpay((va as any).bankCode, bankName);
    const recipient = await this.client.post(
      '/v1/recipients',
      {
        currency: 'NGN',
        country_code: 'NG',
        type: 'ngn_bank',
        bank_name: bankName,
        bank_code: bankCode,
        account_number: accountNumber,
        account_name: accountName,
      },
      bushaProfileId
    );
    return {
      palmpayOrderId,
      palmpayOrderNo,
      recipientId: recipient.id as string,
      vaAmount: exactAmount,
      va,
      recipient,
    };
  }

  private buildSellBankTransferQuoteBody(
    sourceCurrency: string,
    sourceAmount: string,
    recipientId: string,
    network?: string
  ) {
    return {
      source_currency: toBushaCurrency(sourceCurrency),
      target_currency: 'NGN',
      source_amount: String(sourceAmount),
      pay_in: { type: 'balance' },
      pay_out: { type: 'bank_transfer', recipient_id: recipientId },
      ...(network ? { network: toBushaNetwork(network, sourceCurrency) } : {}),
    };
  }

  /** PalmPay amounts are kobo-precise; never ceil — that causes MC100022 mismatches. */
  private exactNgn(value: any): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100) / 100;
  }

  private ngnAmountsMatch(a: number, b: number): boolean {
    return Math.round(a * 100) === Math.round(b * 100);
  }

  private extractQuoteFees(quote: any) {
    const fees = Array.isArray(quote?.fees) ? quote.fees : [];
    const feeTotal = fees.reduce((sum: number, fee: any) => {
      const raw = fee?.amount?.amount ?? fee?.amount ?? fee?.converted_amount?.amount ?? 0;
      const n = Number(raw);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { fees, feeTotal };
  }

  private readSellQuoteRecipientId(providerData: unknown): string | null {
    if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
      return null;
    }
    const id = (providerData as Record<string, unknown>).sellQuoteRecipientId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }

  private async persistSellQuoteRecipientId(
    customerId: number,
    recipientId: string | null,
    providerData: unknown
  ) {
    const base =
      providerData && typeof providerData === 'object' && !Array.isArray(providerData)
        ? { ...(providerData as Record<string, unknown>) }
        : {};
    if (recipientId) {
      base.sellQuoteRecipientId = recipientId;
    } else {
      delete base.sellQuoteRecipientId;
    }
    await prisma.bushaCustomer.update({
      where: { id: customerId },
      data: { providerData: base as any },
    });
  }

  /**
   * Reusable NGN bank recipient for sell *preview* quotes only.
   * Never creates a PalmPay createorder / temp VA (those stay Processing forever).
   * Execute still creates a fresh amount-locked PalmPay VA for the real payout.
   */
  private async ensureSellPreviewRecipient(
    userId: number,
    customer: { id: number; bushaProfileId: string; providerData: unknown },
    platform: Awaited<ReturnType<typeof getOrCreateConfig>>
  ): Promise<string> {
    const cached = this.readSellQuoteRecipientId(customer.providerData);
    if (cached) return cached;

    const persist = async (recipientId: string) => {
      await this.persistSellQuoteRecipientId(customer.id, recipientId, customer.providerData);
      return recipientId;
    };

    // Prefer configured settlement / dashboard bank (no PalmPay VA needed).
    if (platform.payoutBankCode && platform.payoutAccountNumber && platform.payoutAccountName) {
      if (platform.payoutRecipientId) {
        return persist(platform.payoutRecipientId);
      }
      const recipient = await this.client.post(
        '/v1/recipients',
        {
          currency: 'NGN',
          country_code: 'NG',
          type: 'ngn_bank',
          bank_code: platform.payoutBankCode,
          bank_name: platform.payoutAccountName,
          account_number: platform.payoutAccountNumber,
          account_name: platform.payoutAccountName,
        },
        customer.bushaProfileId
      );
      return persist(recipient.id as string);
    }

    // Reuse any existing Busha NGN bank recipient (prefer permanent settlement accounts).
    try {
      const listed = await this.client.get('/v1/recipients', customer.bushaProfileId);
      const rows = Array.isArray(listed) ? listed : (listed as any)?.data || [];
      const ngnBanks = (rows as any[]).filter(
        (r) => r && r.active !== false && (r.type === 'ngn_bank' || r.currency === 'NGN')
      );
      const permanent = ngnBanks.find(
        (r) =>
          typeof r.account_name === 'string' &&
          !/\(Pay NGN /i.test(r.account_name) &&
          r.account_number
      );
      const pick = permanent || ngnBanks[0];
      if (pick?.id) return persist(String(pick.id));
    } catch (err) {
      console.warn('[Busha sell preview] list recipients failed', (err as any)?.message || err);
    }

    // Last resort: register recipient from last sell trade metadata (still no PalmPay createorder).
    const lastSell = await prisma.bushaTradeLog.findFirst({
      where: { userId, side: 'sell' },
      orderBy: { id: 'desc' },
    });
    const payOut = (lastSell?.providerResponse as any)?.quote?.pay_out
      || (lastSell?.providerResponse as any)?.transfer?.pay_out;
    const details = payOut?.recipient_details;
    if (payOut?.recipient_id) {
      return persist(String(payOut.recipient_id));
    }
    if (details?.account_number && details?.bank_code) {
      const recipient = await this.client.post(
        '/v1/recipients',
        {
          currency: 'NGN',
          country_code: 'NG',
          type: 'ngn_bank',
          bank_code: details.bank_code,
          bank_name: details.bank_name || 'PALMPAY',
          account_number: details.account_number,
          account_name: String(details.account_name || 'RHINOX').replace(/\(Pay NGN .*\)/i, '').trim(),
        },
        customer.bushaProfileId
      );
      return persist(recipient.id as string);
    }

    throw ApiError.serviceUnavailable(
      'Sell preview recipient is not configured. Set Busha payout bank details or complete one sell setup first.'
    );
  }

  /**
   * Align PalmPay VA amount to Busha bank_transfer quote.target_amount (exact kobo).
   * PalmPay VAs are amount-locked; ceil/floor mismatch causes MC100022 / cancel.
   */
  private async quoteSellAlignedToPalmPay(
    userId: number,
    bushaProfileId: string,
    sourceCurrency: string,
    sourceAmount: string,
    provisionalAmount: number,
    network?: string
  ) {
    let destination = await this.createPalmPaySellDestination(
      userId,
      provisionalAmount,
      bushaProfileId
    );
    let quote = await this.createQuote(
      bushaProfileId,
      this.buildSellBankTransferQuoteBody(
        sourceCurrency,
        sourceAmount,
        destination.recipientId,
        network
      )
    );

    for (let attempt = 0; attempt < 2; attempt++) {
      const exactNgn = this.exactNgn(quote?.target_amount);
      if (exactNgn < 100) {
        throw ApiError.badRequest('Sell payout amount from quote is below NGN 100');
      }
      if (this.ngnAmountsMatch(exactNgn, destination.vaAmount)) {
        return { quote, destination };
      }

      console.warn(
        `[Busha sell] VA amount ${destination.vaAmount} != quote target ${exactNgn}; recreating VA`
      );
      destination = await this.createPalmPaySellDestination(userId, exactNgn, bushaProfileId);
      quote = await this.createQuote(
        bushaProfileId,
        this.buildSellBankTransferQuoteBody(
          sourceCurrency,
          sourceAmount,
          destination.recipientId,
          network
        )
      );
    }

    const finalExact = this.exactNgn(quote?.target_amount);
    if (!this.ngnAmountsMatch(finalExact, destination.vaAmount)) {
      throw ApiError.badRequest(
        `Could not align PalmPay VA (${destination.vaAmount}) with Busha payout (${finalExact})`
      );
    }
    return { quote, destination };
  }

  async previewBuy(userId: number, sourceAmount: string, targetCurrency: string) {
    const customer = await this.assertCustomerTradeReady(userId);
    const quote = await this.client.post(
      '/v1/quotes',
      {
        source_currency: 'NGN',
        target_currency: toBushaCurrency(targetCurrency),
        source_amount: String(sourceAmount),
        pay_in: { type: 'temporary_bank_account' },
        pay_out: { type: 'balance' },
      },
      customer.bushaProfileId
    );
    const { fees, feeTotal } = this.extractQuoteFees(quote);
    return {
      ...quote,
      isEstimate: true,
      youPayNgn: quote?.source_amount ?? sourceAmount,
      youReceive: quote?.target_amount ?? null,
      feeTotal,
      fees,
      note: 'Estimated crypto you receive. Fees (if any) are shown separately.',
    };
  }

  async executeBuy(userId: number, sourceAmount: string, targetCurrency: string) {
    const customer = await this.assertCustomerTradeReady(userId);
    const amount = Number(sourceAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw ApiError.badRequest('Enter a valid NGN amount');
    }

    const ngnWallet = await prisma.wallet.findUnique({
      where: { userId_currency: { userId, currency: 'NGN' } },
    });
    if (!ngnWallet) throw ApiError.badRequest('NGN wallet not found');
    if (Number(ngnWallet.balance) < amount) {
      throw ApiError.badRequest('Insufficient NGN balance');
    }

    const reference = `busha_buy_${randomUUID().replace(/-/g, '').slice(0, 21)}`;
    const fiatTx = await prisma.transaction.create({
      data: {
        walletId: ngnWallet.id,
        type: 'crypto_buy',
        status: 'pending',
        amount,
        currency: 'NGN',
        reference,
        description: `Buy ${toBushaCurrency(targetCurrency)}`,
        channel: 'busha',
        metadata: { provider: 'busha', targetCurrency: toBushaCurrency(targetCurrency) },
      },
    });

    await prisma.wallet.update({
      where: { id: ngnWallet.id },
      data: { balance: { decrement: amount } },
    });

    let debitReversed = false;
    try {
      const { quote, transfer } = await this.createQuoteAndTransfer(customer.bushaProfileId, {
        source_currency: 'NGN',
        target_currency: toBushaCurrency(targetCurrency),
        source_amount: String(sourceAmount),
        pay_in: { type: 'temporary_bank_account' },
        pay_out: { type: 'balance' },
      });

      const details = transfer.pay_in?.recipient_details || {};
      const trade = await prisma.bushaTradeLog.create({
        data: {
          userId,
          bushaCustomerId: customer.id,
          side: 'buy',
          status: 'awaiting_palmpay',
          sourceCurrency: 'NGN',
          targetCurrency: toBushaCurrency(targetCurrency),
          sourceAmount: String(sourceAmount),
          targetAmount: String(transfer.target_amount || quote.target_amount || ''),
          bushaQuoteId: quote.id,
          bushaTransferId: transfer.id,
          bushaStatus: transfer.status,
          payInBankCode: details.bank_code || null,
          payInBankName: details.bank_name || null,
          payInAccountNumber: details.account_number || null,
          payInAccountName: details.account_name || null,
          payInExpiresAt: transfer.pay_in?.expires_at ? new Date(transfer.pay_in.expires_at) : null,
          fiatTransactionId: fiatTx.id,
          providerResponse: { quote, transfer },
        },
      });

      if (!details.account_number) {
        await this.reverseBuy(trade.id, 'Busha did not return a temporary bank account');
        debitReversed = true;
        throw ApiError.internal('Busha buy account missing');
      }

      const palmpayBankCode = resolvePalmpayBankCode(details.bank_code, details.bank_name);
      const payout = await this.palmPayPayout.initiatePayout({
        orderId: reference.slice(0, 32),
        amount,
        accountNumber: details.account_number,
        accountName: details.account_name || 'Busha',
        bankCode: palmpayBankCode,
        userId,
      });
      const palmpayStatus = mapPalmPayStatus((payout as any).orderStatus);
      await prisma.bushaTradeLog.update({
        where: { id: trade.id },
        data: {
          palmpayOrderId: reference.slice(0, 32),
          palmpayOrderNo: (payout as any).orderNo || null,
          palmpayStatus,
          status: palmpayStatus === 'failed' ? 'palmpay_failed' : 'awaiting_busha',
        },
      });

      if (palmpayStatus === 'failed') {
        await this.reverseBuy(trade.id, 'PalmPay payout to Busha failed');
        debitReversed = true;
        throw ApiError.internal('Failed to fund Busha buy account');
      }

      return prisma.bushaTradeLog.findUnique({ where: { id: trade.id } });
    } catch (error) {
      if (!debitReversed) {
        await prisma.wallet.update({
          where: { id: ngnWallet.id },
          data: { balance: { increment: amount } },
        });
        await prisma.transaction.update({
          where: { id: fiatTx.id },
          data: { status: 'failed', description: 'Busha buy reversed' },
        });
      }
      throw error instanceof BushaProviderError ? error.toApiError() : error;
    }
  }

  async previewSell(userId: number, sourceCurrency: string, sourceAmount: string) {
    const platform = await this.assertPlatformActive();
    const customer = await this.assertCustomerTradeReady(userId);
    // Must use bank_transfer (same as execute). Balance→balance quotes omit payout fees (feeTotal=0).
    let recipientId = await this.ensureSellPreviewRecipient(userId, customer, platform);
    let quote: any;
    try {
      quote = await this.createQuote(
        customer.bushaProfileId,
        this.buildSellBankTransferQuoteBody(sourceCurrency, sourceAmount, recipientId)
      );
    } catch (firstError) {
      // Stale cached recipient — clear and retry once with a fresh destination
      console.warn(
        '[Busha sell preview] bank_transfer quote failed; recreating preview recipient',
        (firstError as any)?.message || firstError
      );
      await this.persistSellQuoteRecipientId(customer.id, null, customer.providerData);
      const refreshed = await prisma.bushaCustomer.findUnique({ where: { id: customer.id } });
      recipientId = await this.ensureSellPreviewRecipient(
        userId,
        refreshed || { ...customer, providerData: null },
        platform
      );
      quote = await this.createQuote(
        customer.bushaProfileId,
        this.buildSellBankTransferQuoteBody(sourceCurrency, sourceAmount, recipientId)
      );
    }
    const { fees, feeTotal } = this.extractQuoteFees(quote);
    const netNgn = Number(quote?.target_amount || 0);
    return {
      ...quote,
      isEstimate: true,
      payoutType: 'bank_transfer',
      youSell: String(sourceAmount),
      youSellCurrency: toBushaCurrency(sourceCurrency),
      netNgn: quote?.target_amount ?? null,
      feeTotal,
      fees,
      /** Net NGN after bank_transfer fees (matches execute payout target). */
      youReceiveNgn: quote?.target_amount ?? null,
      /** Gross before fees when fees are listed separately */
      grossNgnEstimate:
        Number.isFinite(netNgn) && feeTotal > 0 ? String(Number((netNgn + feeTotal).toFixed(2))) : null,
      note:
        'Estimated NGN you receive after bank payout fees. Final amount is confirmed when the sell executes.',
    };
  }

  async executeSell(userId: number, sourceCurrency: string, sourceAmount: string, network?: string) {
    const platform = await this.assertPlatformActive();
    const customer = await this.assertCustomerTradeReady(userId);
    const preview = await this.previewSell(userId, sourceCurrency, sourceAmount);
    const estimatedNgn = Number(preview.target_amount || preview.netNgn || 0);
    if (estimatedNgn < 100) {
      throw ApiError.badRequest('Sell amount is below the NGN 100 minimum');
    }

    let recipientId = platform.payoutRecipientId;
    let payoutMode = platform.sellPayoutMode;
    let palmpayOrderId: string | null = null;
    let palmpayOrderNo: string | null = null;
    let quote: any;
    let transfer: any;
    let vaAmount: number | null = null;
    let feeMeta: { fees: any[]; feeTotal: number } = { fees: [], feeTotal: 0 };

    if (platform.sellPayoutMode === 'dashboard_bank') {
      if (!platform.payoutBankCode || !platform.payoutAccountNumber || !platform.payoutAccountName) {
        throw ApiError.serviceUnavailable('Dashboard bank payout is not configured');
      }
      if (!recipientId) {
        const recipient = await this.client.post(
          '/v1/recipients',
          {
            currency: 'NGN',
            country_code: 'NG',
            type: 'ngn_bank',
            bank_code: platform.payoutBankCode,
            bank_name: platform.payoutAccountName,
            account_number: platform.payoutAccountNumber,
            account_name: platform.payoutAccountName,
          },
          customer.bushaProfileId
        );
        recipientId = recipient.id;
        await prisma.bushaConfig.update({
          where: { id: 1 },
          data: { payoutRecipientId: recipient.id },
        });
      }
      ({ quote, transfer } = await this.createQuoteAndTransfer(
        customer.bushaProfileId,
        this.buildSellBankTransferQuoteBody(
          sourceCurrency,
          sourceAmount,
          recipientId!,
          network
        )
      ));
      feeMeta = this.extractQuoteFees(quote);
    } else {
      payoutMode = 'palmpay_temp';
      // 1) provisional VA from estimate → 2) bank_transfer quote → 3) recreate VA at exact target_amount
      const provisionalAmount = this.exactNgn(estimatedNgn);
      const aligned = await this.quoteSellAlignedToPalmPay(
        userId,
        customer.bushaProfileId,
        sourceCurrency,
        sourceAmount,
        provisionalAmount,
        network
      );
      quote = aligned.quote;
      recipientId = aligned.destination.recipientId;
      palmpayOrderId = aligned.destination.palmpayOrderId;
      palmpayOrderNo = aligned.destination.palmpayOrderNo;
      vaAmount = aligned.destination.vaAmount;
      feeMeta = this.extractQuoteFees(quote);

      const quoteTarget = this.exactNgn(quote?.target_amount);
      if (!this.ngnAmountsMatch(quoteTarget, vaAmount!)) {
        throw ApiError.badRequest(
          `PalmPay VA amount ${vaAmount} does not match Busha payout ${quoteTarget}`
        );
      }

      // Only create transfer after VA amount === quote.target_amount (exact kobo)
      transfer = await this.createTransferFromQuote(customer.bushaProfileId, quote.id);
      const paid = this.exactNgn(transfer?.target_amount || quote?.target_amount);
      if (!this.ngnAmountsMatch(paid, vaAmount!)) {
        // Should be rare once quote is aligned; log for ops — do not leave user hanging mid-flight
        console.error('[Busha sell] post-transfer amount mismatch', {
          paid,
          vaAmount,
          transferId: transfer?.id,
          palmpayOrderId,
        });
      }
    }

    const ngnWallet = await prisma.wallet.findUnique({
      where: { userId_currency: { userId, currency: 'NGN' } },
    });
    if (!ngnWallet) throw ApiError.badRequest('NGN wallet not found');

    const creditAmount = Number(transfer.target_amount || quote.target_amount || estimatedNgn);
    const fiatTx = await prisma.transaction.create({
      data: {
        walletId: ngnWallet.id,
        type: 'crypto_sell',
        status: 'pending',
        amount: creditAmount,
        currency: 'NGN',
        reference: `busha_sell_tx_${randomUUID().slice(0, 12)}`,
        description: `Sell ${toBushaCurrency(sourceCurrency)}`,
        channel: 'busha',
        metadata: {
          provider: 'busha',
          transferId: transfer.id,
          palmpayOrderId,
          vaAmount,
          fees: feeMeta.fees,
          feeTotal: feeMeta.feeTotal,
          netNgn: transfer.target_amount || quote.target_amount,
        },
      },
    });

    return prisma.bushaTradeLog.create({
      data: {
        userId,
        bushaCustomerId: customer.id,
        side: 'sell',
        status: 'settling',
        sourceCurrency: toBushaCurrency(sourceCurrency),
        targetCurrency: 'NGN',
        sourceAmount: String(sourceAmount),
        targetAmount: String(transfer.target_amount || quote.target_amount || ''),
        network: network ? toBushaNetwork(network, sourceCurrency) : null,
        bushaQuoteId: quote.id,
        bushaTransferId: transfer.id,
        bushaStatus: transfer.status,
        palmpayOrderId,
        palmpayOrderNo,
        payoutMode,
        fiatTransactionId: fiatTx.id,
        providerResponse: {
          quote,
          transfer,
          preview,
          vaAmount,
          fees: feeMeta.fees,
          feeTotal: feeMeta.feeTotal,
        },
      },
    });
  }

  async createReceive(userId: number, input: { currency: string; amount: string; network?: string }) {
    const customer = await this.assertCustomerTradeReady(userId);
    const currency = toBushaCurrency(input.currency);
    const network = toBushaNetwork(input.network || currency, currency);
    const { quote, transfer } = await this.createQuoteAndTransfer(customer.bushaProfileId, {
      source_currency: currency,
      target_currency: currency,
      source_amount: String(input.amount),
      pay_in: { type: 'address', network },
      pay_out: { type: 'balance' },
    });

    return prisma.bushaTradeLog.create({
      data: {
        userId,
        bushaCustomerId: customer.id,
        side: 'cryptoRecv',
        status: 'awaiting_crypto_deposit',
        sourceCurrency: currency,
        targetCurrency: currency,
        sourceAmount: String(input.amount),
        targetAmount: String(transfer.target_amount || input.amount),
        network,
        bushaQuoteId: quote.id,
        bushaTransferId: transfer.id,
        bushaStatus: transfer.status,
        cryptoDepositAddress: transfer.pay_in?.address || null,
        cryptoDepositNetwork: transfer.pay_in?.network || network,
        payInExpiresAt: transfer.pay_in?.expires_at ? new Date(transfer.pay_in.expires_at) : null,
        providerResponse: { quote, transfer },
      },
    });
  }

  private matchCurrencyNetwork(networks: any[], networkInput: string, currency: string) {
    const bushaNet = toBushaNetwork(networkInput, currency).toUpperCase();
    const inputKey = String(networkInput || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return (networks || []).find((n: any) => {
      const id = String(n?.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const name = String(n?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const net = String(n?.network || '').toUpperCase();
      return (
        net === bushaNet ||
        id === inputKey ||
        name.includes(inputKey) ||
        toBushaNetwork(String(n?.id || n?.network || ''), currency).toUpperCase() === bushaNet
      );
    });
  }

  /**
   * Busha GET /v1/currencies/{code} includes per-network min/max withdrawal amounts.
   */
  async getWithdrawLimits(userId: number, currency: string) {
    const customer = await this.assertCustomerTradeReady(userId);
    const code = toBushaCurrency(currency);
    const remote = await this.client.get<any>(`/v1/currencies/${code}`, customer.bushaProfileId);
    const networks = Array.isArray(remote?.supported_networks) ? remote.supported_networks : [];
    let mapped = networks.map((n: any) => {
      const bushaNetwork = toBushaNetwork(String(n?.network || n?.id || n?.name || ''), code);
      const chain = fromBushaNetwork(bushaNetwork);
      return {
        id: String(n?.id || chain.blockchain),
        bushaNetwork,
        name: chain.blockchainName,
        blockchain: chain.blockchain,
        blockchainName: chain.blockchainName,
        withdrawal: n?.withdrawal !== false,
        deposit: n?.deposit !== false,
        minWithdrawalAmount:
          n?.min_withdrawal_amount != null && n.min_withdrawal_amount !== ''
            ? String(n.min_withdrawal_amount)
            : null,
        maxWithdrawalAmount:
          n?.max_withdrawal_amount != null && n.max_withdrawal_amount !== ''
            ? String(n.max_withdrawal_amount)
            : null,
        withdrawalFee:
          n?.withdrawal_fee != null && n.withdrawal_fee !== '' ? String(n.withdrawal_fee) : null,
        minDepositAmount:
          n?.min_deposit_amount != null && n.min_deposit_amount !== ''
            ? String(n.min_deposit_amount)
            : null,
      };
    });

    if (code === 'USDT') {
      mapped = mapped.filter((n) => n.bushaNetwork !== 'MATIC');
    }

    if (shouldPreferStableNetworkDefaults(code, mapped)) {
      const byNet = new Map(mapped.map((n) => [n.bushaNetwork, n]));
      mapped = getBushaNetworksForCurrency(code).map((bushaNetwork) => {
        const existing = byNet.get(bushaNetwork);
        const chain = fromBushaNetwork(bushaNetwork);
        return {
          id: existing?.id || chain.blockchain,
          bushaNetwork,
          name: chain.blockchainName,
          blockchain: chain.blockchain,
          blockchainName: chain.blockchainName,
          withdrawal: existing?.withdrawal ?? true,
          deposit: existing?.deposit ?? true,
          minWithdrawalAmount: existing?.minWithdrawalAmount ?? null,
          maxWithdrawalAmount: existing?.maxWithdrawalAmount ?? null,
          withdrawalFee: existing?.withdrawalFee ?? null,
          minDepositAmount: existing?.minDepositAmount ?? null,
        };
      });
    }

    return {
      currency: code,
      name: remote?.display_name || remote?.name || code,
      withdrawalEnabled: remote?.withdrawal !== false,
      defaultNetwork: remote?.default_network || null,
      networks: mapped,
    };
  }

  private async assertWithdrawAmountWithinLimits(
    userId: number,
    currency: string,
    network: string,
    amount: string
  ) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw ApiError.badRequest('Enter a valid withdraw amount');
    }
    let limits: Awaited<ReturnType<BushaAppService['getWithdrawLimits']>>;
    try {
      limits = await this.getWithdrawLimits(userId, currency);
    } catch (error) {
      console.warn(
        '[Busha] withdraw limits unavailable; skipping min check',
        error instanceof Error ? error.message : error
      );
      return null;
    }
    if (!limits.withdrawalEnabled) {
      throw ApiError.badRequest(`${toBushaCurrency(currency)} withdrawals are not available`);
    }
    const net = this.matchCurrencyNetwork(limits.networks as any[], network, currency);
    if (net && net.withdrawal === false) {
      throw ApiError.badRequest(`Withdrawals are disabled on this network for ${limits.currency}`);
    }
    const min = Number(net?.minWithdrawalAmount);
    if (Number.isFinite(min) && min > 0 && amt < min) {
      throw ApiError.badRequest(
        `Minimum withdraw is ${min} ${limits.currency} on ${net?.name || 'this network'}`
      );
    }
    const max = Number(net?.maxWithdrawalAmount);
    if (Number.isFinite(max) && max > 0 && amt > max) {
      throw ApiError.badRequest(
        `Maximum withdraw is ${max} ${limits.currency} on ${net?.name || 'this network'}`
      );
    }
    return net || null;
  }

  async previewSend(userId: number, input: { currency: string; amount: string; destinationAddress: string; network: string }) {
    const customer = await this.assertCustomerTradeReady(userId);
    const currency = toBushaCurrency(input.currency);
    const networkLimits = await this.assertWithdrawAmountWithinLimits(
      userId,
      currency,
      input.network,
      input.amount
    );
    const quote = await this.client.post(
      '/v1/quotes',
      {
        source_currency: currency,
        target_currency: currency,
        source_amount: String(input.amount),
        pay_in: { type: 'balance' },
        pay_out: {
          type: 'address',
          address: input.destinationAddress,
          network: toBushaNetwork(input.network, currency),
        },
      },
      customer.bushaProfileId
    );
    const { fees, feeTotal } = this.extractQuoteFees(quote);
    return {
      ...quote,
      feeTotal,
      fees,
      minWithdrawalAmount: networkLimits?.minWithdrawalAmount ?? null,
      maxWithdrawalAmount: networkLimits?.maxWithdrawalAmount ?? null,
      networkWithdrawalFee: networkLimits?.withdrawalFee ?? null,
      networkName: networkLimits?.name ?? null,
    };
  }

  async executeSend(userId: number, input: { currency: string; amount: string; destinationAddress: string; network: string; memo?: string }) {
    const customer = await this.assertCustomerTradeReady(userId);
    const currency = toBushaCurrency(input.currency);
    const network = toBushaNetwork(input.network, currency);
    await this.assertWithdrawAmountWithinLimits(userId, currency, input.network, input.amount);
    const { quote, transfer } = await this.createQuoteAndTransfer(customer.bushaProfileId, {
      source_currency: currency,
      target_currency: currency,
      source_amount: String(input.amount),
      pay_in: { type: 'balance' },
      pay_out: {
        type: 'address',
        address: input.destinationAddress,
        network,
        memo: input.memo || '',
      },
    });

    return prisma.bushaTradeLog.create({
      data: {
        userId,
        bushaCustomerId: customer.id,
        side: 'cryptoSend',
        status: 'awaiting_busha',
        sourceCurrency: currency,
        targetCurrency: currency,
        sourceAmount: String(input.amount),
        targetAmount: String(transfer.target_amount || input.amount),
        network,
        destinationAddress: input.destinationAddress,
        bushaQuoteId: quote.id,
        bushaTransferId: transfer.id,
        bushaStatus: transfer.status,
        providerResponse: { quote, transfer },
      },
    });
  }

  async listTrades(userId: number) {
    return prisma.bushaTradeLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getTrade(userId: number, tradeId: number) {
    const trade = await prisma.bushaTradeLog.findFirst({ where: { id: tradeId, userId } });
    if (!trade) throw ApiError.notFound('Trade not found');
    return trade;
  }

  async refreshTrade(userId: number, tradeId: number) {
    const trade = await this.getTrade(userId, tradeId);
    await this.settleTrade(trade.id);
    return this.getTrade(userId, tradeId);
  }

  async settleTrade(tradeId: number) {
    const trade = await prisma.bushaTradeLog.findUnique({
      where: { id: tradeId },
      include: { bushaCustomer: true },
    });
    if (!trade?.bushaTransferId || !trade.bushaCustomer) return;
    if (['completed', 'wallet_credited', 'buy_reversed', 'busha_failed', 'palmpay_failed'].includes(trade.status)) {
      return;
    }

    const remote = await this.client.get<any>(
      `/v1/transfers/${trade.bushaTransferId}`,
      trade.bushaCustomer.bushaProfileId
    );
    const remoteStatus = String(remote?.status || '').toLowerCase();

    await prisma.bushaTradeLog.update({
      where: { id: trade.id },
      data: { bushaStatus: remoteStatus, providerResponse: { ...(trade.providerResponse as object || {}), remote } },
    });

    const success = SUCCESS_STATUSES.has(remoteStatus) || (remoteStatus === 'funds_received' && trade.side !== 'sell');
    const failed = FAIL_STATUSES.has(remoteStatus);

    if (success) {
      if (trade.side === 'sell') {
        await this.creditSell(trade.id, remote.target_amount || trade.targetAmount);
      } else if (trade.side === 'buy' && trade.fiatTransactionId) {
        await prisma.transaction.update({
          where: { id: trade.fiatTransactionId },
          data: { status: 'completed', completedAt: new Date() },
        });
        await prisma.bushaTradeLog.update({ where: { id: trade.id }, data: { status: 'completed' } });
      } else {
        await prisma.bushaTradeLog.update({ where: { id: trade.id }, data: { status: 'completed' } });
      }
    } else if (failed) {
      if (trade.side === 'buy') {
        await this.reverseBuy(trade.id, `Busha status ${remoteStatus}`);
      } else {
        await this.markSellFailed(trade.id, remoteStatus);
      }
    }
  }

  /**
   * Close sell trade + pending crypto_sell tx without crediting Rhinox.
   * Funds may remain on the Busha customer NGN balance after cancel.
   */
  async failSellTrade(tradeId: number, remoteStatus: string) {
    return this.markSellFailed(tradeId, remoteStatus);
  }

  private async markSellFailed(tradeId: number, remoteStatus: string) {
    const trade = await prisma.bushaTradeLog.findUnique({ where: { id: tradeId } });
    if (!trade) return;
    if (['wallet_credited', 'completed'].includes(trade.status)) return;

    await prisma.bushaTradeLog.update({
      where: { id: tradeId },
      data: {
        status: 'busha_failed',
        bushaStatus: remoteStatus,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          failure: {
            at: new Date().toISOString(),
            bushaStatus: remoteStatus,
            note: 'NGN may remain on Busha customer balance; do not double-credit Rhinox',
          },
        },
      },
    });

    if (trade.fiatTransactionId) {
      const tx = await prisma.transaction.findUnique({ where: { id: trade.fiatTransactionId } });
      if (tx && !['completed', 'failed', 'cancelled'].includes(tx.status)) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            status: 'failed',
            metadata: {
              ...((tx.metadata as object) || {}),
              provider: 'busha',
              bushaStatus: remoteStatus,
              failureReason: `Busha transfer ${remoteStatus}`,
              fundsNote: 'NGN may remain on Busha balance; not credited to Rhinox wallet',
            },
          },
        });
      }
    }
  }

  async settleOpenTrades() {
    const trades = await prisma.bushaTradeLog.findMany({
      where: { status: { in: OPEN_TRADE_STATUSES } },
      take: 40,
      orderBy: { updatedAt: 'asc' },
    });
    for (const trade of trades) {
      try {
        await this.settleTrade(trade.id);
      } catch (error) {
        console.error('[Busha settlement] trade', trade.id, error);
      }

      // Reconcile PalmPay VA status for sells when webhooks are missing
      if (
        trade.side === 'sell' &&
        trade.payoutMode === 'palmpay_temp' &&
        trade.palmpayOrderId &&
        !['wallet_credited', 'completed', 'busha_failed', 'palmpay_failed'].includes(trade.status)
      ) {
        try {
          await this.syncSellPalmPayStatus(trade.id, trade.palmpayOrderId);
        } catch (error) {
          console.error('[Busha settlement] PalmPay sync', trade.id, error);
        }
      }
    }
  }

  async syncSellPalmPayStatus(tradeId: number, palmpayOrderId: string) {
    const order = await this.palmPayDeposit.queryOrderStatus(palmpayOrderId);
    const mapped = mapPalmPayStatus((order as any).orderStatus);
    const trade = await prisma.bushaTradeLog.findUnique({ where: { id: tradeId } });
    if (!trade) return;

    await prisma.bushaTradeLog.update({
      where: { id: tradeId },
      data: {
        palmpayStatus: mapped,
        palmpayOrderNo: (order as any).orderNo || trade.palmpayOrderNo,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          palmpayStatusPoll: order,
        } as any,
      },
    });

    if (mapped === 'completed') {
      await this.settleTrade(tradeId);
    } else if (mapped === 'failed' || mapped === 'cancelled') {
      await prisma.bushaTradeLog.update({
        where: { id: tradeId },
        data: { palmpayStatus: mapped },
      });
      const bushaStatus = String(trade.bushaStatus || '').toLowerCase();
      if (
        FAIL_STATUSES.has(bushaStatus) ||
        trade.status === 'busha_failed'
      ) {
        await this.markSellFailed(tradeId, bushaStatus || mapped);
      }
    }
  }

  async retryPendingKyc() {
    const apps = await prisma.bushaKycApplication.findMany({
      where: { status: { in: ['pending', 'failed'] } },
      take: 10,
      orderBy: { updatedAt: 'asc' },
    });
    for (const app of apps) {
      try {
        await this.processKycApplication(app.id);
      } catch (error) {
        console.error('[Busha KYC poller]', app.id, error);
      }
    }

    // Also re-check customers still waiting on Busha approval
    const waitingCustomers = await prisma.bushaCustomer.findMany({
      where: {
        status: { not: 'active' },
      },
      take: 20,
      orderBy: { updatedAt: 'asc' },
    });
    for (const customer of waitingCustomers) {
      try {
        await this.syncCustomerFromProvider(customer);
      } catch (error) {
        console.error('[Busha customer sync]', customer.id, error);
      }
    }
  }

  async handleCustomerWebhook(payload: any) {
    const profileId = payload?.data?.id || payload?.id;
    const status = payload?.data?.status || payload?.status;
    if (!profileId || !status) return;
    const customer = await prisma.bushaCustomer.findUnique({ where: { bushaProfileId: profileId } });
    if (!customer) return;
    await prisma.bushaCustomer.update({
      where: { id: customer.id },
      data: { status, providerData: payload.data || payload },
    });
    await prisma.bushaKycApplication.updateMany({
      where: { bushaCustomerId: customer.id },
      data: { status: status === 'rejected' ? 'rejected' : status },
    });
  }

  async handleTransferWebhook(payload: any) {
    const transferId = payload?.data?.id || payload?.id;
    if (!transferId) return;
    const trade = await prisma.bushaTradeLog.findFirst({ where: { bushaTransferId: transferId } });
    if (!trade) return;
    await this.settleTrade(trade.id);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature?: string | null): boolean {
    const secret = getBushaConfig().webhookSecret;
    if (!secret) return true;
    if (!signature) return false;
    const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
    return digest === signature.replace(/^sha256=/i, '');
  }

  private async creditSell(tradeId: number, amount: string | number) {
    const trade = await prisma.bushaTradeLog.findUnique({ where: { id: tradeId } });
    if (!trade?.fiatTransactionId) return;
    const creditAmount = Number(amount);
    const tx = await prisma.transaction.findUnique({ where: { id: trade.fiatTransactionId } });
    if (!tx || tx.status === 'completed') {
      await prisma.bushaTradeLog.update({ where: { id: tradeId }, data: { status: 'wallet_credited' } });
      return;
    }
    await prisma.wallet.update({
      where: { id: tx.walletId },
      data: { balance: { increment: creditAmount } },
    });
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'completed', amount: creditAmount, completedAt: new Date() },
    });
    await prisma.bushaTradeLog.update({
      where: { id: tradeId },
      data: { status: 'wallet_credited', targetAmount: String(amount) },
    });
  }

  private async reverseBuy(tradeId: number, reason: string) {
    const trade = await prisma.bushaTradeLog.findUnique({ where: { id: tradeId } });
    if (!trade?.fiatTransactionId) return;
    const tx = await prisma.transaction.findUnique({ where: { id: trade.fiatTransactionId } });
    if (!tx || tx.status === 'failed') return;
    await prisma.wallet.update({
      where: { id: tx.walletId },
      data: { balance: { increment: Number(tx.amount) } },
    });
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'failed', description: reason },
    });
    await prisma.bushaTradeLog.update({
      where: { id: tradeId },
      data: { status: 'buy_reversed' },
    });
  }
}
