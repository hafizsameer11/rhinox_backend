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

    return countries.map((country: { id: number; name: string | null; code: string | null; flag: string | null; createdAt: Date; updatedAt: Date }) => ({
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
    const parsedId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(parsedId) || parsedId <= 0) {
      throw new Error('Invalid country ID format');
    }

    const country = await prisma.country.findUnique({
      where: { id: parsedId },
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

