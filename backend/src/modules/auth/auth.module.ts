import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/**
 * Auth Module
 * Handles authentication, registration, and user management
 */
export class AuthModule implements IModule {
  public readonly name = 'auth';
  public readonly path = '/api/auth';
  public readonly router: Router;

  private controller: AuthController;
  private service: AuthService;

  constructor() {
    // Initialize dependencies
    this.service = new AuthService();
    this.controller = new AuthController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Auth routes
    this.router.post('/register', this.controller.register.bind(this.controller));
    this.router.post('/login', this.controller.login.bind(this.controller));
    this.router.post('/logout', this.controller.logout.bind(this.controller));
    this.router.post('/refresh', this.controller.refreshToken.bind(this.controller));
    this.router.get('/me', this.controller.getCurrentUser.bind(this.controller));
    
    // Email verification (can be called without auth for new registrations)
    this.router.post('/verify-email', this.controller.verifyEmail.bind(this.controller));
    this.router.post('/resend-verification', this.controller.resendVerification.bind(this.controller));
    
    // PIN management (requires authentication)
    this.router.post('/setup-pin', this.controller.setupPIN.bind(this.controller));
    this.router.post('/change-pin', this.controller.changePIN.bind(this.controller));
    
    // Face verification (requires authentication)
    this.router.post('/mark-face-verified', this.controller.markFaceVerified.bind(this.controller));
  }
}

