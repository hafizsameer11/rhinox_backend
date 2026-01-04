import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { authMiddleware } from '../../core/middleware/auth.middleware.js';

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
    // Auth routes (public)
    this.router.post('/register', this.controller.register.bind(this.controller));
    this.router.post('/login', this.controller.login.bind(this.controller));
    this.router.post('/logout', authMiddleware, this.controller.logout.bind(this.controller));
    
    // Email verification (can be called without auth for new registrations)
    this.router.post('/verify-email', this.controller.verifyEmail.bind(this.controller));
    this.router.post('/resend-verification', this.controller.resendVerification.bind(this.controller));
    
    // PIN management (requires authentication)
    this.router.post('/setup-pin', authMiddleware, this.controller.setupPIN.bind(this.controller));
    this.router.post('/verify-password-for-pin', authMiddleware, this.controller.verifyPasswordForPIN.bind(this.controller));
    this.router.post('/set-pin', authMiddleware, this.controller.setPIN.bind(this.controller));
    this.router.post('/change-pin', authMiddleware, this.controller.changePIN.bind(this.controller));
    
    // Face verification (requires authentication)
    this.router.post('/mark-face-verified', authMiddleware, this.controller.markFaceVerified.bind(this.controller));
    
    // Get current user (requires authentication)
    this.router.get('/me', authMiddleware, this.controller.getCurrentUser.bind(this.controller));
  }
}

