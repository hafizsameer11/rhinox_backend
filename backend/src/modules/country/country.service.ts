import prisma from '../../core/config/database.js';

/**
 * Country Service
 * Business logic for country operations
 */
export class CountryService {
  /**
   * Get all countries
   */
  async getAllCountries() {
    const countries = await prisma.country.findMany({
      orderBy: { name: 'asc' },
    });

    return countries.map((country) => ({
      id: country.id,
      name: country.name,
      code: country.code,
      flag: country.flag ? `/uploads/flags/${country.flag}` : null,
      createdAt: country.createdAt,
      updatedAt: country.updatedAt,
    }));
  }

  /**
   * Get country by code
   */
  async getCountryByCode(code: string) {
    const country = await prisma.country.findUnique({
      where: { code },
    });

    if (!country) {
      throw new Error('Country not found');
    }

    return {
      id: country.id,
      name: country.name,
      code: country.code,
      flag: country.flag ? `/uploads/flags/${country.flag}` : null,
      createdAt: country.createdAt,
      updatedAt: country.updatedAt,
    };
  }

  /**
   * Get country by ID
   */
  async getCountryById(id: string) {
    const country = await prisma.country.findUnique({
      where: { id },
    });

    if (!country) {
      throw new Error('Country not found');
    }

    return {
      id: country.id,
      name: country.name,
      code: country.code,
      flag: country.flag ? `/uploads/flags/${country.flag}` : null,
      createdAt: country.createdAt,
      updatedAt: country.updatedAt,
    };
  }
}

