import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { BillPaymentController } from './bill-payment.controller.js';
import { BillPaymentService } from './bill-payment.service.js';

/**
 * Bill Payment Module
 * Handles bill payments (airtime, data, electricity, cable TV, betting, internet)
 */
export class BillPaymentModule implements IModule {
  public readonly name = 'bill-payment';
  public readonly path = '/api/bill-payment';
  public readonly router: Router;

  private controller: BillPaymentController;
  private service: BillPaymentService;

  constructor() {
    // Initialize dependencies
    this.service = new BillPaymentService();
    this.controller = new BillPaymentController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Categories and providers
    this.router.get('/categories', this.controller.getCategories.bind(this.controller));
    this.router.get('/providers', this.controller.getProviders.bind(this.controller));
    this.router.get('/plans', this.controller.getPlans.bind(this.controller));

    // Validation
    this.router.post('/validate-meter', this.controller.validateMeter.bind(this.controller));
    this.router.post('/validate-account', this.controller.validateAccount.bind(this.controller));

    // Payment flow
    this.router.post('/initiate', this.controller.initiatePayment.bind(this.controller));
    this.router.post('/confirm', this.controller.confirmPayment.bind(this.controller));

    // Beneficiaries
    this.router.get('/beneficiaries', this.controller.getBeneficiaries.bind(this.controller));
    this.router.post('/beneficiaries', this.controller.createBeneficiary.bind(this.controller));
    this.router.put('/beneficiaries/:id', this.controller.updateBeneficiary.bind(this.controller));
    this.router.delete('/beneficiaries/:id', this.controller.deleteBeneficiary.bind(this.controller));
  }
}

