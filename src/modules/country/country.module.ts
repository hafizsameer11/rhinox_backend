import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { CountryController } from './country.controller.js';
import { CountryService } from './country.service.js';

/**
 * Country Module
 * Handles country-related operations
 */
export class CountryModule implements IModule {
  public readonly name = 'country';
  public readonly path = '/api/countries';
  public readonly router: Router;

  private controller: CountryController;
  private service: CountryService;

  constructor() {
    // Initialize dependencies
    this.service = new CountryService();
    this.controller = new CountryController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Country routes (public, no auth required)
    this.router.get('/', this.controller.getAllCountries.bind(this.controller));
    this.router.get('/:code', this.controller.getCountryByCode.bind(this.controller));
  }
}

