import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { adminAuthMiddleware } from '../../core/middleware/admin-auth.middleware.js';
import { requirePermission } from '../../core/middleware/require-permission.middleware.js';
import { uploadSingle } from '../../core/middleware/upload.middleware.js';
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
    this.service = new KYCService();
    this.controller = new KYCController(this.service);

    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post('/submit', this.controller.submitKYC.bind(this.controller));
    this.router.get('/status', this.controller.getKYCStatus.bind(this.controller));
    // Multipart selfie (field: selfie) and/or JSON imageUrl
    this.router.post(
      '/face-verification',
      uploadSingle('selfie'),
      this.controller.submitFaceVerification.bind(this.controller)
    );
    this.router.post(
      '/upload-id',
      uploadSingle('document'),
      this.controller.uploadIDDocument.bind(this.controller)
    );

    this.router.post(
      '/admin/approve',
      adminAuthMiddleware,
      requirePermission('kyc.write'),
      this.controller.approveKYC.bind(this.controller)
    );
    this.router.post(
      '/admin/reject',
      adminAuthMiddleware,
      requirePermission('kyc.write'),
      this.controller.rejectKYC.bind(this.controller)
    );
  }
}
