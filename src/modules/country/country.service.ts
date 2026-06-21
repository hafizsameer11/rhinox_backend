import prisma from '../../core/config/database.js';
import { SUPPORTED_AFRICAN_COUNTRY_CODES } from '../../core/constants/supported-countries.js';

function normalizeFlagPath(flag: string | null | undefined): string | null {
  if (!flag) return null;
  const trimmed = flag.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/uploads/flags/')) {
    return trimmed;
  }
  if (trimmed.includes('/uploads/flags/')) {
    const idx = trimmed.lastIndexOf('/uploads/flags/');
    return trimmed.slice(idx);
  }
  const filename = trimmed.replace(/^\/+/, '').replace(/^uploads\/flags\//, '');
  return `/uploads/flags/${filename}`;
}

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
      where: {
        code: {
          in: [...SUPPORTED_AFRICAN_COUNTRY_CODES],
        },
      },
      orderBy: { name: 'asc' },
    });

    return countries.map((country: { id: number; name: string | null; code: string | null; flag: string | null; createdAt: Date; updatedAt: Date }) => ({
      id: country.id,
      name: country.name,
      code: country.code,
      flag: normalizeFlagPath(country.flag),
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
      flag: normalizeFlagPath(country.flag),
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
      flag: normalizeFlagPath(country.flag),
      createdAt: country.createdAt,
      updatedAt: country.updatedAt,
    };
  }
}

