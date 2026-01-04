import { type Request, type Response } from 'express';
import { CountryService } from './country.service.js';

/**
 * Country Controller
 * Handles HTTP requests for country operations
 */
export class CountryController {
  constructor(private service: CountryService) {}

  /**
   * @swagger
   * /api/countries:
   *   get:
   *     summary: Get all countries
   *     tags: [Country]
   *     description: Returns a list of all available countries with their flags
   *     responses:
   *       200:
   *         description: List of countries
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                         example: "uuid"
   *                       name:
   *                         type: string
   *                         example: "Nigeria"
   *                       code:
   *                         type: string
   *                         example: "NG"
   *                       flag:
   *                         type: string
   *                         nullable: true
   *                         example: "/uploads/flags/ngn.png"
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *                       updatedAt:
   *                         type: string
   *                         format: date-time
   */
  async getAllCountries(req: Request, res: Response) {
    try {
      const countries = await this.service.getAllCountries();

      return res.json({
        success: true,
        data: countries,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get countries',
      });
    }
  }

  /**
   * @swagger
   * /api/countries/{code}:
   *   get:
   *     summary: Get country by code
   *     tags: [Country]
   *     parameters:
   *       - in: path
   *         name: code
   *         required: true
   *         schema:
   *           type: string
   *         example: "NG"
   *         description: ISO country code (e.g., NG, KE, GH)
   *     responses:
   *       200:
   *         description: Country information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     name:
   *                       type: string
   *                     code:
   *                       type: string
   *                     flag:
   *                       type: string
   *                       nullable: true
   *       404:
   *         description: Country not found
   *         $ref: '#/components/schemas/Error'
   */
  async getCountryByCode(req: Request, res: Response) {
    try {
      const { code } = req.params;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Country code is required',
        });
      }

      const country = await this.service.getCountryByCode(code);

      return res.json({
        success: true,
        data: country,
      });
    } catch (error: any) {
      if (error.message === 'Country not found') {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get country',
      });
    }
  }
}

