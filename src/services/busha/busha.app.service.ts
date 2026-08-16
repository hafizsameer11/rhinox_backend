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
import { fromBushaNetwork, isCryptoCurrency, toBushaCurrency, toBushaNetwork } from './busha.networks.js';

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
      const receive = await this.createReceive(userId, {
        currency: bushaCurrency,
        amount: bushaCurrency === 'BTC' ? '0.0001' : '1',
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
    const balances = await this.listBalances(userId);
    return balances.map((item, index) => {
      const currency = toBushaCurrency(item.currency);
      const available = item.available?.amount || item.available || '0';
      const total = item.total?.amount || item.total || available;
      const chain = fromBushaNetwork(currency === 'USDT' ? 'TRX' : currency);
      return {
        id: item.id || index,
        type: 'crypto' as const,
        currency,
        blockchain: chain.blockchain,
        currencyName: item.name || currency,
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
      };
    });
  }

  async mapUnifiedBalances(userId: number) {
    const rows = await this.mapBalancesForWallet(userId);
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.symbol) || [];
      list.push(row);
      grouped.set(row.symbol, list);
    }
    return Array.from(grouped.entries()).map(([symbol, networks]) => ({
      symbol,
      totalBalance: networks.reduce((sum, item) => sum + Number(item.balance || 0), 0).toString(),
      totalAvailable: networks.reduce((sum, item) => sum + Number(item.availableBalance || 0), 0).toString(),
      isUnifiedStable: symbol === 'USDT' || symbol === 'USDC',
      networks: networks.map((item) => ({
        virtualAccountId: 0,
        currency: item.currency,
        blockchain: item.blockchain,
        blockchainName: item.currencyName,
        balance: item.balance,
        available: item.availableBalance,
        depositAddress: null,
      })),
    }));
  }

  private async createQuoteAndTransfer(profileId: string, quoteBody: Record<string, any>) {
    const quote = await this.client.post('/v1/quotes', quoteBody, profileId);
    const transfer = await this.client.post('/v1/transfers', { quote_id: quote.id }, profileId);
    return { quote, transfer };
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
    return quote;
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
    const customer = await this.assertCustomerTradeReady(userId);
    return this.client.post(
      '/v1/quotes',
      {
        source_currency: toBushaCurrency(sourceCurrency),
        target_currency: 'NGN',
        source_amount: String(sourceAmount),
        pay_in: { type: 'balance' },
        pay_out: { type: 'balance' },
      },
      customer.bushaProfileId
    );
  }

  async executeSell(userId: number, sourceCurrency: string, sourceAmount: string, network?: string) {
    const platform = await this.assertPlatformActive();
    const customer = await this.assertCustomerTradeReady(userId);
    const preview = await this.previewSell(userId, sourceCurrency, sourceAmount);
    const estimatedNgn = Number(preview.target_amount || 0);
    if (estimatedNgn < 100) {
      throw ApiError.badRequest('Sell amount is below the NGN 100 minimum');
    }

    let recipientId = platform.payoutRecipientId;
    let payoutMode = platform.sellPayoutMode;
    let palmpayOrderId: string | null = null;
    let palmpayOrderNo: string | null = null;

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
    } else {
      payoutMode = 'palmpay_temp';
      palmpayOrderId = `busha_sell_${randomUUID().replace(/-/g, '').slice(0, 20)}`.slice(0, 32);
      const va = await this.palmPayDeposit.createVirtualAccountOrder({
        orderId: palmpayOrderId,
        amount: Math.ceil(estimatedNgn),
        userId,
      });
      palmpayOrderNo = (va as any).orderNo || null;
      const accountNumber =
        (va as any).payerVirtualAccNo || (va as any).virtualAccNo || (va as any).accountNumber;
      const accountName = (va as any).payerAccountName || (va as any).accountName || 'PalmPay';
      const bankName = (va as any).payerBankName || (va as any).bankName || 'PalmPay';
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
        customer.bushaProfileId
      );
      recipientId = recipient.id;
    }

    const { quote, transfer } = await this.createQuoteAndTransfer(customer.bushaProfileId, {
      source_currency: toBushaCurrency(sourceCurrency),
      target_currency: 'NGN',
      source_amount: String(sourceAmount),
      pay_in: { type: 'balance' },
      pay_out: { type: 'bank_transfer', recipient_id: recipientId },
      ...(network ? { network: toBushaNetwork(network, sourceCurrency) } : {}),
    });

    const ngnWallet = await prisma.wallet.findUnique({
      where: { userId_currency: { userId, currency: 'NGN' } },
    });
    if (!ngnWallet) throw ApiError.badRequest('NGN wallet not found');

    const fiatTx = await prisma.transaction.create({
      data: {
        walletId: ngnWallet.id,
        type: 'crypto_sell',
        status: 'pending',
        amount: Number(transfer.target_amount || estimatedNgn),
        currency: 'NGN',
        reference: `busha_sell_tx_${randomUUID().slice(0, 12)}`,
        description: `Sell ${toBushaCurrency(sourceCurrency)}`,
        channel: 'busha',
        metadata: { provider: 'busha', transferId: transfer.id },
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
        providerResponse: { quote, transfer },
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

  async previewSend(userId: number, input: { currency: string; amount: string; destinationAddress: string; network: string }) {
    const customer = await this.assertCustomerTradeReady(userId);
    const currency = toBushaCurrency(input.currency);
    return this.client.post(
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
  }

  async executeSend(userId: number, input: { currency: string; amount: string; destinationAddress: string; network: string; memo?: string }) {
    const customer = await this.assertCustomerTradeReady(userId);
    const currency = toBushaCurrency(input.currency);
    const network = toBushaNetwork(input.network, currency);
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
        await prisma.bushaTradeLog.update({ where: { id: trade.id }, data: { status: 'busha_failed' } });
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
        bushaProfileId: { not: null },
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
