import prisma from '../../core/config/database.js';

/**
 * Bank Account Service
 * Handles public bank account information
 */
export class BankAccountService {
  /**
   * Get all active bank accounts
   * @param countryCode - Optional country code filter (e.g., 'NG')
   * @param currency - Optional currency filter (e.g., 'NGN')
   * @returns List of bank accounts
   */
  async getBankAccounts(countryCode?: string, currency?: string) {
    const where: any = {
      isActive: true,
    };

    if (countryCode) {
      where.countryCode = countryCode;
    }

    if (currency) {
      where.currency = currency;
    }

    const bankAccounts = await prisma.bankAccount.findMany({
      where,
      orderBy: [
        { countryCode: 'asc' },
        { currency: 'asc' },
        { bankName: 'asc' },
      ],
      select: {
        id: true,
        countryCode: true,
        currency: true,
        bankName: true,
        accountNumber: true,
        accountName: true,
        createdAt: true,
      },
    });

    return bankAccounts;
  }

  /**
   * Get bank accounts for a specific country and currency
   * @param countryCode - Country code (e.g., 'NG')
   * @param currency - Currency code (e.g., 'NGN')
   * @returns List of bank accounts
   */
  async getBankAccountsByCountryAndCurrency(countryCode: string, currency: string) {
    return this.getBankAccounts(countryCode, currency);
  }
}

