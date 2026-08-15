/**
 * Maps Rhinox MobileMoneyProvider.code + country → Flutterwave charge network
 * and transfer account_bank codes.
 */

export type FlutterwaveChargeType =
  | 'mpesa'
  | 'mobile_money_ghana'
  | 'mobile_money_uganda'
  | 'mobile_money_tanzania';

const CHARGE_TYPE_BY_COUNTRY: Record<string, FlutterwaveChargeType> = {
  KE: 'mpesa',
  GH: 'mobile_money_ghana',
  UG: 'mobile_money_uganda',
  TZ: 'mobile_money_tanzania',
};

/** Normalize provider codes from DB/seed to Flutterwave charge `network` values. */
const CHARGE_NETWORK: Record<string, Record<string, string>> = {
  KE: {
    MPESA: 'MPESA',
    MPS: 'MPESA',
    AIRTEL: 'AIRTEL',
    MPX: 'AIRTEL',
    MTN: 'MTN',
  },
  GH: {
    MTN: 'MTN',
    VODAFONE: 'VODAFONE',
    TELECEL: 'VODAFONE',
    TIGO: 'TIGO',
    AIRTELTIGO: 'TIGO',
    AIRTEL: 'TIGO',
  },
  UG: {
    MTN: 'MTN',
    AIRTEL: 'AIRTEL',
  },
  TZ: {
    AIRTEL: 'AIRTEL',
    TIGO: 'TIGO',
    HALOPESA: 'HALOPESA',
    VODACOM: 'VODACOM',
    MPESA: 'VODACOM',
  },
};

/** Transfer payout `account_bank` codes. */
const TRANSFER_BANK: Record<string, Record<string, string>> = {
  KE: {
    MPESA: 'MPS',
    MPS: 'MPS',
    AIRTEL: 'MPX',
    MPX: 'MPX',
  },
  GH: {
    MTN: 'MTN',
    VODAFONE: 'VODAFONE',
    TELECEL: 'VODAFONE',
    TIGO: 'TIGO',
    AIRTELTIGO: 'AIRTELTIGO',
    AIRTEL: 'AIRTELTIGO',
  },
  UG: {
    MTN: 'MTN',
    AIRTEL: 'AIRTEL',
  },
  TZ: {
    AIRTEL: 'AIRTEL',
    TIGO: 'TIGO',
    HALOPESA: 'HALOPESA',
    VODACOM: 'VODACOM',
    MPESA: 'VODACOM',
  },
};

export const getFlutterwaveChargeType = (countryCode: string): FlutterwaveChargeType => {
  const type = CHARGE_TYPE_BY_COUNTRY[countryCode.toUpperCase()];
  if (!type) {
    throw new Error(`Flutterwave mobile money charges are not supported for ${countryCode}`);
  }
  return type;
};

export const getFlutterwaveChargeNetwork = (countryCode: string, providerCode: string): string | undefined => {
  const country = countryCode.toUpperCase();
  const code = providerCode.toUpperCase();
  // M-Pesa Kenya charges typically omit network
  if (country === 'KE' && (code === 'MPESA' || code === 'MPS')) {
    return undefined;
  }
  const network = CHARGE_NETWORK[country]?.[code];
  if (!network && country !== 'KE') {
    throw new Error(`Unsupported mobile money network ${providerCode} for ${countryCode}`);
  }
  return network;
};

export const getFlutterwaveTransferBankCode = (countryCode: string, providerCode: string): string => {
  const bank = TRANSFER_BANK[countryCode.toUpperCase()]?.[providerCode.toUpperCase()];
  if (!bank) {
    throw new Error(`Unsupported mobile money payout network ${providerCode} for ${countryCode}`);
  }
  return bank;
};
