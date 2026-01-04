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
   *     summary: Register a new user account
   *     description: |
   *       Creates a new user account and sends a 5-digit OTP code to the provided email address for verification.
   *       After registration, the user must verify their email using the OTP code before they can use the platform.
   *       Auth tokens are returned immediately after registration for convenience.
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
   *                 example: "user@example.com"
   *                 description: User's email address. Must be unique and valid email format. A verification OTP will be sent to this email.
   *               phone:
   *                 type: string
   *                 example: "+2348012345678"
   *                 description: User's phone number in international format. Must be unique. Used for account recovery and notifications.
   *               password:
   *                 type: string
   *                 format: password
   *                 minLength: 8
   *                 example: "SecurePassword123!"
   *                 description: User's password. Must be at least 8 characters long. Will be hashed before storage.
   *               firstName:
   *                 type: string
   *                 minLength: 1
   *                 example: "John"
   *                 description: User's first name. Required for account identification and KYC.
   *               lastName:
   *                 type: string
   *                 minLength: 1
   *                 example: "Doe"
   *                 description: User's last name. Required for account identification and KYC.
   *               countryId:
   *                 type: string
   *                 format: uuid
   *                 example: "550e8400-e29b-41d4-a716-446655440000"
   *                 description: Optional. UUID of the country selected by the user. Use GET /api/countries to get available countries.
   *               termsAccepted:
   *                 type: boolean
   *                 example: true
   *                 description: Must be true. Indicates user has accepted Terms & Conditions and Privacy Policy.
   *     responses:
   *       201:
   *         description: User registered successfully. OTP sent to email. Auth tokens returned for immediate use.
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
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                           format: uuid
   *                           example: "550e8400-e29b-41d4-a716-446655440000"
   *                         email:
   *                           type: string
   *                           example: "user@example.com"
   *                         phone:
   *                           type: string
   *                           example: "+2348012345678"
   *                         firstName:
   *                           type: string
   *                           example: "John"
   *                         lastName:
   *                           type: string
   *                           example: "Doe"
   *                         isEmailVerified:
   *                           type: boolean
   *                           example: false
   *                           description: Will be true after email verification
   *                     accessToken:
   *                       type: string
   *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *                       description: JWT access token for authentication. Include in Authorization header as "Bearer {token}". Token is long-lived (365 days).
   *                     message:
   *                       type: string
   *                       example: "Registration successful. Please verify your email with the OTP sent to your email."
   *       400:
   *         description: Validation error or user already exists
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "User with this email already exists"
   *                   description: |
   *                     Error message. Examples: "User with this email already exists" or "Email and password are required"
   *       500:
   *         description: Internal server error
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
   *                       description: JWT access token for authentication. Include in Authorization header as "Bearer {token}". Token is long-lived (365 days).
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
      const userId = (req as any).userId || (req as any).user?.id;
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
   *     summary: Verify email address with OTP code
   *     description: |
   *       Verifies the user's email address using the 5-digit OTP code sent to their email during registration.
   *       After successful verification, the user's email is marked as verified and crypto wallets are automatically initialized.
   *       Returns new authentication tokens after verification.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - code
   *             properties:
   *               userId:
   *                 type: string
   *                 format: uuid
   *                 example: "550e8400-e29b-41d4-a716-446655440000"
   *                 description: Optional. User ID (can be extracted from JWT token if authenticated). Required if not authenticated.
   *               code:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 minLength: 5
   *                 maxLength: 5
   *                 example: "12345"
   *                 description: 5-digit OTP code sent to user's email. Code expires after 10 minutes.
   *     responses:
   *       200:
   *         description: Email verified successfully. Crypto wallets initialized. New tokens returned.
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
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                           format: uuid
   *                         email:
   *                           type: string
   *                         phone:
   *                           type: string
   *                         firstName:
   *                           type: string
   *                         lastName:
   *                           type: string
   *                         isEmailVerified:
   *                           type: boolean
   *                           example: true
   *                           description: Email verification status (now true)
   *                     accessToken:
   *                       type: string
   *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *                       description: JWT access token for authentication. Include in Authorization header as "Bearer {token}". Token is long-lived (365 days).
   *                     message:
   *                       type: string
   *                       example: "Email verified successfully"
   *       400:
   *         description: Invalid or expired OTP code, or code format error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "Invalid or expired OTP code"
   *                   description: |
   *                     Error message. Examples: "Invalid or expired OTP code" or "OTP code must be 5 digits"
   *       401:
   *         description: Unauthorized or user ID missing
   *         $ref: '#/components/schemas/Error'
   */
  async verifyEmail(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.id || req.body.userId;
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
      const userId = (req as any).userId || (req as any).user?.id || req.body.userId;

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
   *     summary: Setup 5-digit transaction PIN
   *     description: |
   *       Sets up a 5-digit PIN for the user's account. This PIN is required for all financial transactions
   *       (deposits, transfers, conversions, etc.). The PIN is hashed before storage for security.
   *       Can only be set once. To change an existing PIN, use the change-pin endpoint.
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
   *                 minLength: 5
   *                 maxLength: 5
   *                 example: "12345"
   *                 description: |
   *                   5-digit PIN code. Must be exactly 5 numeric digits.
   *                   This PIN will be required for all financial transactions.
   *                   Choose a PIN that is easy to remember but hard to guess.
   *     responses:
   *       200:
   *         description: PIN setup successfully. PIN is now active and required for transactions.
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
   *                     hasPin:
   *                       type: boolean
   *                       example: true
   *                       description: Confirmation that PIN is now set
   *       400:
   *         description: |
   *           Validation error. Common errors:
   *           - "PIN is required"
   *           - "PIN must be exactly 5 digits"
   *           - "PIN already set. Use change-pin endpoint to update your PIN"
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *       401:
   *         description: Unauthorized - authentication required
   *         $ref: '#/components/schemas/Error'
   */
  async setupPIN(req: Request, res: Response) {
    try {
      // Get userId from middleware (set by authMiddleware)
      const userId = (req as any).userId || (req as any).user?.id;
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
      const userId = (req as any).userId || (req as any).user?.id;
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
      const userId = (req as any).userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      // Service accepts both string and number
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

