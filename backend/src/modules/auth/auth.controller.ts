import { type Request, type Response } from 'express';
import { AuthService } from './auth.service.js';

/**
 * Auth Controller
 * Handles HTTP requests for authentication
 */
export class AuthController {
  constructor(private service: AuthService) {}

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *               - firstName
   *               - lastName
   *               - phone
   *               - termsAccepted
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: user@example.com
   *               phone:
   *                 type: string
   *                 example: "+1234567890"
   *               password:
   *                 type: string
   *                 format: password
   *                 example: "SecurePassword123"
   *               firstName:
   *                 type: string
   *                 example: "John"
   *               lastName:
   *                 type: string
   *                 example: "Doe"
   *               countryId:
   *                 type: string
   *                 example: "uuid-of-country"
   *               termsAccepted:
   *                 type: boolean
   *                 example: true
   *     responses:
   *       201:
   *         description: User registered successfully. OTP sent to email.
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
   *                     user:
   *                       $ref: '#/components/schemas/User'
   *                     message:
   *                       type: string
   *                       example: "Registration successful. Please verify your email with the OTP sent to your email."
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async register(req: Request, res: Response) {
    try {
      const { 
        email, 
        phone, 
        password, 
        firstName, 
        lastName, 
        countryId,
        termsAccepted 
      } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'First name and last name are required',
        });
      }

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required',
        });
      }

      if (!termsAccepted) {
        return res.status(400).json({
          success: false,
          message: 'You must accept the Terms & Conditions and Privacy Policy',
        });
      }

      const result = await this.service.register({
        email,
        phone,
        password,
        firstName,
        lastName,
        countryId,
        termsAccepted,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Registration failed',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: user@example.com
   *               password:
   *                 type: string
   *                 format: password
   *                 example: "SecurePassword123"
   *     responses:
   *       200:
   *         description: Login successful
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
   *                     user:
   *                       $ref: '#/components/schemas/User'
   *                     accessToken:
   *                       type: string
   *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *                     refreshToken:
   *                       type: string
   *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *       401:
   *         description: Invalid credentials
   *         $ref: '#/components/schemas/Error'
   */
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      const result = await this.service.login(email, password, ipAddress, userAgent);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Login failed',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: Logout user
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Invalidates user session and refresh token
   *     responses:
   *       200:
   *         description: Logout successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Logged out successfully"
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async logout(req: Request, res: Response) {
    try {
      // TODO: Implement logout logic (invalidate session)
      return res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Logout failed',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     summary: Refresh access token
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *     responses:
   *       200:
   *         description: Token refreshed successfully
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
   *                     accessToken:
   *                       type: string
   *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *                     refreshToken:
   *                       type: string
   *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *       401:
   *         description: Invalid or expired refresh token
   *         $ref: '#/components/schemas/Error'
   */
  async refreshToken(req: Request, res: Response) {
    try {
      // TODO: Implement refresh token logic
      return res.json({
        success: true,
        message: 'Token refreshed',
      });
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Token refresh failed',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     summary: Get current authenticated user
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: User information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/User'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getCurrentUser(req: Request, res: Response) {
    try {
      // TODO: Extract userId from JWT token
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const user = await this.service.getCurrentUser(userId);

      return res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/verify-email:
   *   post:
   *     summary: Verify email with OTP code
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userId
   *               - code
   *             properties:
   *               userId:
   *                 type: string
   *                 example: "user-uuid"
   *               code:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 example: "12345"
   *                 description: 5-digit OTP code
   *     responses:
   *       200:
   *         description: Email verified successfully
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
   *                     user:
   *                       $ref: '#/components/schemas/User'
   *                     accessToken:
   *                       type: string
   *                     refreshToken:
   *                       type: string
   *                     message:
   *                       type: string
   *                       example: "Email verified successfully"
   *       400:
   *         description: Invalid or expired OTP
   *         $ref: '#/components/schemas/Error'
   */
  async verifyEmail(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.body.userId;
      const { code } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User ID is required',
        });
      }

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'OTP code is required',
        });
      }

      // Validate code format (5 digits)
      if (!/^\d{5}$/.test(code)) {
        return res.status(400).json({
          success: false,
          message: 'OTP code must be 5 digits',
        });
      }

      const result = await this.service.verifyEmailOTP(userId, code);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Email verification failed',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/resend-verification:
   *   post:
   *     summary: Resend email verification OTP
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userId
   *             properties:
   *               userId:
   *                 type: string
   *                 example: "user-uuid"
   *     responses:
   *       200:
   *         description: OTP resent successfully
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
   *                     message:
   *                       type: string
   *                       example: "OTP has been resent to your email"
   *       400:
   *         description: Error resending OTP
   *         $ref: '#/components/schemas/Error'
   */
  async resendVerification(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.body.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const result = await this.service.resendEmailOTP(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to resend verification',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/setup-pin:
   *   post:
   *     summary: Setup 5-digit PIN for transactions
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - pin
   *             properties:
   *               pin:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 example: "12345"
   *                 description: 5-digit PIN
   *     responses:
   *       200:
   *         description: PIN setup successfully
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
   *                     message:
   *                       type: string
   *                       example: "PIN setup successfully"
   *       400:
   *         description: Invalid PIN or PIN already set
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async setupPIN(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { pin } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!pin) {
        return res.status(400).json({
          success: false,
          message: 'PIN is required',
        });
      }

      // Validate PIN format (5 digits)
      if (!/^\d{5}$/.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be exactly 5 digits',
        });
      }

      const result = await this.service.setupPIN(userId, pin);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to setup PIN',
      });
    }
  }

  /**
   * Change PIN
   * POST /api/auth/change-pin
   */
  async changePIN(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { oldPin, newPin } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!oldPin || !newPin) {
        return res.status(400).json({
          success: false,
          message: 'Old PIN and new PIN are required',
        });
      }

      // Validate PIN format (5 digits)
      if (!/^\d{5}$/.test(newPin)) {
        return res.status(400).json({
          success: false,
          message: 'New PIN must be exactly 5 digits',
        });
      }

      const result = await this.service.changePIN(userId, oldPin, newPin);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to change PIN',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/mark-face-verified:
   *   post:
   *     summary: Mark face verification as successful
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Face verification marked as successful
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
   *                     faceVerificationSuccessful:
   *                       type: boolean
   *                       example: true
   *                     message:
   *                       type: string
   *                       example: "Face verification marked as successful"
   *       400:
   *         description: KYC not found or validation error
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markFaceVerified(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.markFaceVerified(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark face as verified',
      });
    }
  }
}

