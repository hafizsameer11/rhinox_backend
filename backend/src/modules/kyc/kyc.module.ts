import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { KYCController } from './kyc.controller.js';
import { KYCService } from './kyc.service.js';

/**
 * KYC Module
 * Handles KYC registration and verification
 */
export class KYCModule implements IModule {
  public readonly name = 'kyc';
  public readonly path = '/api/kyc';
  public readonly router: Router;

  private controller: KYCController;
  private service: KYCService;

  constructor() {
    // Initialize dependencies
    this.service = new KYCService();
    this.controller = new KYCController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // KYC routes (all require authentication)
    this.router.post('/submit', this.controller.submitKYC.bind(this.controller));
    this.router.get('/status', this.controller.getKYCStatus.bind(this.controller));
    this.router.post('/face-verification', this.controller.submitFaceVerification.bind(this.controller));
    this.router.post('/upload-id', this.controller.uploadIDDocument.bind(this.controller));
    
    // Admin routes (for testing/approval)
    this.router.post('/admin/approve', this.controller.approveKYC.bind(this.controller));
    this.router.post('/admin/reject', this.controller.rejectKYC.bind(this.controller));
  }
}

