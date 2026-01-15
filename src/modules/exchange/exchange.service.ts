import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';

/**
 * Exchange Rate Service
 * Manages currency exchange rates
 */
export class ExchangeService {
  /**
   * Get exchange rate between two currencies
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string) {
    // If same currency, return 1
    if (fromCurrency === toCurrency) {
      return {
        fromCurrency,
        toCurrency,
        rate: '1',
        inverseRate: '1',
      };
    }

    // Try direct rate
    let exchangeRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
        },
      },
    });

    if (exchangeRate && exchangeRate.isActive) {
      return {
        fromCurrency: exchangeRate.fromCurrency,
        toCurrency: exchangeRate.toCurrency,
        rate: exchangeRate.rate.toString(),
        inverseRate: exchangeRate.inverseRate?.toString() || (1 / Number(exchangeRate.rate)).toString(),
      };
    }

    // Try inverse rate
    const inverseRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: toCurrency.toUpperCase(),
          toCurrency: fromCurrency.toUpperCase(),
        },
      },
    });

    if (inverseRate && inverseRate.isActive) {
      const rate = inverseRate.inverseRate 
        ? Number(inverseRate.inverseRate) 
        : 1 / Number(inverseRate.rate);
      
      return {
        fromCurrency,
        toCurrency,
        rate: rate.toString(),
        inverseRate: inverseRate.rate.toString(),
      };
    }

    throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
  }

  /**
   * Convert amount from one currency to another
   */
  async convertAmount(amount: number, fromCurrency: string, toCurrency: string) {
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    const rateNum = parseFloat(rate.rate);
    const convertedAmount = amount * rateNum;
    
    return {
      fromAmount: amount.toString(),
      fromCurrency,
      toAmount: convertedAmount.toString(),
      toCurrency,
      rate: rate.rate,
      inverseRate: rate.inverseRate,
    };
  }

  /**
   * Set or update exchange rate
   */
  async setExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    rate: number,
    inverseRate?: number
  ) {
    if (fromCurrency === toCurrency) {
      throw new Error('Cannot set exchange rate for same currency');
    }

    if (rate <= 0) {
      throw new Error('Exchange rate must be greater than 0');
    }

    const calculatedInverseRate = inverseRate || 1 / rate;

    const exchangeRate = await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
        },
      },
      update: {
        rate: new Decimal(rate),
        inverseRate: new Decimal(calculatedInverseRate),
        isActive: true,
      },
      create: {
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate: new Decimal(rate),
        inverseRate: new Decimal(calculatedInverseRate),
        isActive: true,
      },
    });

    return {
      id: exchangeRate.id,
      fromCurrency: exchangeRate.fromCurrency,
      toCurrency: exchangeRate.toCurrency,
      rate: exchangeRate.rate.toString(),
      inverseRate: exchangeRate.inverseRate?.toString() || calculatedInverseRate.toString(),
      isActive: exchangeRate.isActive,
      createdAt: exchangeRate.createdAt,
      updatedAt: exchangeRate.updatedAt,
    };
  }

  /**
   * Get all exchange rates (for admin)
   */
  async getAllExchangeRates(activeOnly: boolean = false) {
    const where = activeOnly ? { isActive: true } : {};
    
    const rates = await prisma.exchangeRate.findMany({
      where,
      orderBy: [
        { fromCurrency: 'asc' },
        { toCurrency: 'asc' },
      ],
    });

    return rates.map((rate: any) => ({
      id: rate.id,
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      rate: rate.rate.toString(),
      inverseRate: rate.inverseRate?.toString() || (1 / Number(rate.rate)).toString(),
      isActive: rate.isActive,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    }));
  }

  /**
   * Get exchange rates for a base currency (e.g., all rates from NGN)
   */
  async getRatesFromBase(baseCurrency: string) {
    const rates = await prisma.exchangeRate.findMany({
      where: {
        fromCurrency: baseCurrency.toUpperCase(),
        isActive: true,
      },
      orderBy: { toCurrency: 'asc' },
    });

    return rates.map((rate: any) => ({
      toCurrency: rate.toCurrency,
      rate: rate.rate.toString(),
      inverseRate: rate.inverseRate?.toString() || (1 / Number(rate.rate)).toString(),
    }));
  }

  /**
   * Deactivate exchange rate
   */
  async deactivateRate(fromCurrency: string, toCurrency: string) {
    const rate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
        },
      },
    });

    if (!rate) {
      throw new Error('Exchange rate not found');
    }

    return prisma.exchangeRate.update({
      where: { id: rate.id },
      data: { isActive: false },
    });
  }

  /**
   * Get all currencies (fiat only)
   */
  async getCurrencies() {
    const currencies = await prisma.currency.findMany({
      where: {
        type: 'fiat', // Only return fiat currencies
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return currencies.map((currency: any) => ({
      id: currency.id,
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      type: currency.type,
      flag: currency.flag ? `/uploads/flags/${currency.flag}` : null,
      isActive: currency.isActive,
    }));
  }
}

