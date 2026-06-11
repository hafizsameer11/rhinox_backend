import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import prisma from '../../core/config/database.js';
import { generateOTP, sendOTPEmail } from '../../core/utils/email.service.js';
import { parseOptionalId } from '../../core/utils/idParser.js';
import {
  notifyEmailVerified,
  notifyLogin,
  notifyPasswordReset,
  notifyPinChanged,
  notifyPinSetup,
  notifyRegistration,
} from '../../core/utils/notification.events.js';
import {
  isSupportedAfricanCountry,
} from '../../core/constants/supported-countries.js';
import { ensureRhinoxPayId, generateUniqueRhinoxPayId } from '../../core/utils/rhinox-pay-id.service.js';
import { initializeUserWallets } from '../../services/user-wallet-init.service.js';

export class EmailNotVerifiedError extends Error {
  readonly code = 'EMAIL_NOT_VERIFIED';

  constructor(
    readonly userId: number,
    message = 'Please verify your email before logging in. A new verification code has been sent to your email.'
  ) {
    super(message);
    this.name = 'EmailNotVerifiedError';
  }
}

/**
 * Auth Service
 * Business logic for authentication
 */
export class AuthService {

  /**
   * Register a new user
   */
  async register(
    data: {
      email: string;
      phone: string;
      password: string;
      firstName: string;
      lastName: string;
      countryId?: string;
      termsAccepted: boolean;
    },
    ipAddress?: string,
    userAgent?: string,
    deviceName?: string
  ) {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Check if phone exists
    const existingPhone = await prisma.user.findUnique({
      where: { phone: data.phone },
    });
    if (existingPhone) {
      throw new Error('User with this phone number already exists');
    }

    // Validate country if provided and parse ID
    let parsedCountryId: number | undefined;
    if (data.countryId) {
      parsedCountryId = parseOptionalId(data.countryId, 'countryId');
      if (parsedCountryId) {
        const country = await prisma.country.findUnique({
          where: { id: parsedCountryId },
        });
        if (!country) {
          throw new Error('Invalid country selected');
        }
        if (!isSupportedAfricanCountry(country.code)) {
          throw new Error('Selected country is not supported. Please choose an African country.');
        }
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);
    const rhinoxPayId = await generateUniqueRhinoxPayId();

    // Create user (not verified yet)
    const userData: any = {
      email: data.email,
      phone: data.phone,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      termsAccepted: data.termsAccepted,
      isEmailVerified: false, // Will be verified after OTP
      rhinoxPayId,
      ...(parsedCountryId && { countryId: parsedCountryId }),
    };
    
    const user = await prisma.user.create({
      data: userData,
    });

    // Generate and send OTP for email verification
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: otpCode,
        type: 'email',
        expiresAt,
      },
    });

    // Send OTP email
    await sendOTPEmail(user.email, otpCode, 'email');

    // Generate tokens immediately after registration
    const tokens = this.generateTokens(user.id.toString());

    // Create session
    const sessionData: any = {
      userId: user.id,
      token: tokens.accessToken,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };

    if (ipAddress) {
      sessionData.ipAddress = ipAddress;
    }

    if (userAgent) {
      sessionData.userAgent = userAgent;
    }

    if (deviceName) {
      sessionData.deviceName = deviceName;
    }

    await prisma.session.create({
      data: sessionData,
    });

    notifyRegistration(user.id);

    // Return user with tokens (email verification still required but user can use app)
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        rhinoxPayId: user.rhinoxPayId,
        isEmailVerified: false,
      },
      ...tokens,
      message: 'Registration successful. Please verify your email with the OTP sent to your email.',
    };
  }

  /**
   * Login user
   */
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
    deviceName?: string
  ) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    if (!user.isEmailVerified) {
      await this.resendEmailOTP(String(user.id)).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to resend verification OTP for user ${user.id}:`, message);
      });
      throw new EmailNotVerifiedError(user.id);
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id.toString());

    // Create session (long-lived to match token)
    const sessionData: any = {
      userId: user.id,
      token: tokens.accessToken,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };
    
    if (ipAddress) {
      sessionData.ipAddress = ipAddress;
    }
    
    if (userAgent) {
      sessionData.userAgent = userAgent;
    }

    if (deviceName) {
      sessionData.deviceName = deviceName;
    }
    
    await prisma.session.create({
      data: sessionData,
    });

    notifyLogin(user.id, ipAddress ?? null);

    const rhinoxPayId = await ensureRhinoxPayId(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        rhinoxPayId,
      },
      ...tokens,
    };
  }

  /**
   * Generate JWT access token
   * Token doesn't expire (or very long expiration)
   */
  private generateTokens(userId: string) {
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const expiresInValue: string = process.env.JWT_EXPIRES_IN || '365d';
    
    // Use type assertion to satisfy TypeScript strict types
    const accessToken = jwt.sign(
      { userId },
      jwtSecret,
      { expiresIn: expiresInValue as any }
    ) as string;

    return { accessToken };
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
    });
    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      hasPin: !!user.pinHash,
    };
  }

  /**
   * Verify Email OTP
   */
  async verifyEmailOTP(userId: string, code: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Find valid OTP
    const otp = await prisma.oTP.findFirst({
      where: {
        userId: parsedUserId,
        code,
        type: 'email',
        isUsed: false,
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otp) {
      throw new Error('Invalid or expired OTP code');
    }

    // Mark OTP as used
    await prisma.oTP.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });

    // Update user email verification status
    const user = await prisma.user.update({
      where: { id: parsedUserId },
      data: {
        isEmailVerified: true,
      },
    });

    // Create fiat + crypto wallets before returning (ensures wallets exist on live)
    try {
      await initializeUserWallets(user.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to initialize wallets for user ${user.id}:`, message);
    }

    notifyEmailVerified(user.id);

    // Generate tokens after verification
    const tokens = this.generateTokens(user.id.toString());

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token: tokens.accessToken,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
      },
      ...tokens,
      message: 'Email verified successfully',
    };
  }

  /**
   * Resend Email OTP
   */
  async resendEmailOTP(userId: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.isEmailVerified) {
      throw new Error('Email is already verified');
    }

    // Invalidate old unused OTPs
    await prisma.oTP.updateMany({
      where: {
        userId: parsedUserId,
        type: 'email',
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: otpCode,
        type: 'email',
        expiresAt,
      },
    });

    // Send OTP email
    await sendOTPEmail(user.email, otpCode, 'email');

    return {
      message: 'OTP has been resent to your email',
    };
  }

  /**
   * Setup PIN
   */
  async setupPIN(userId: string, pin: string) {
    // Validate PIN (must be 5 digits)
    if (!/^\d{5}$/.test(pin)) {
      throw new Error('PIN must be exactly 5 digits');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.pinHash) {
      throw new Error('PIN already set. Use change PIN endpoint to update.');
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 10);

    // Update user
    await prisma.user.update({
      where: { id: parsedUserId },
      data: { pinHash },
    });

    notifyPinSetup(parsedUserId, false);

    return {
      message: 'PIN setup successfully',
    };
  }

  /**
   * Verify password for PIN setup/change
   */
  async verifyPasswordForPIN(userId: string, password: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid password');
    }

    return {
      verified: true,
      message: 'Password verified successfully',
    };
  }

  /**
   * Set or update PIN after password verification
   */
  async setPINAfterVerification(userId: string, pin: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Validate PIN (must be 5 digits)
    if (!/^\d{5}$/.test(pin)) {
      throw new Error('PIN must be exactly 5 digits');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { id: true, pinHash: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 10);

    // Update user PIN (can be setting new or updating existing)
    await prisma.user.update({
      where: { id: parsedUserId },
      data: { pinHash },
    });

    notifyPinSetup(parsedUserId, Boolean(user.pinHash));

    return {
      message: user.pinHash ? 'PIN updated successfully' : 'PIN setup successfully',
      hasPin: true,
    };
  }

  /**
   * Change PIN
   */
  async changePIN(userId: string, oldPin: string, newPin: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Validate new PIN
    if (!/^\d{5}$/.test(newPin)) {
      throw new Error('New PIN must be exactly 5 digits');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.pinHash) {
      throw new Error('PIN not set. Use setup PIN endpoint first.');
    }

    // Verify old PIN
    const isValid = await bcrypt.compare(oldPin, user.pinHash);
    if (!isValid) {
      throw new Error('Invalid current PIN');
    }

    // Hash new PIN
    const pinHash = await bcrypt.hash(newPin, 10);

    // Update user
    await prisma.user.update({
      where: { id: parsedUserId },
      data: { pinHash },
    });

    notifyPinChanged(parsedUserId);

    return {
      message: 'PIN changed successfully',
    };
  }

  /**
   * Mark face as verified
   */
  async markFaceVerified(userId: string | number) {
    // Convert userId to number for database query (KYC uses integer userId)
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID');
    }

    // Check if KYC exists
    const kyc = await prisma.kYC.findUnique({
      where: { userId: parsedUserId },
    });

    if (!kyc) {
      throw new Error('KYC not found. Please complete KYC registration first.');
    }

    // Update face verification status
    const updatedKYC = await prisma.kYC.update({
      where: { userId: parsedUserId },
      data: {
        faceVerificationSuccessful: true,
      },
    });

    return {
      faceVerificationSuccessful: updatedKYC.faceVerificationSuccessful,
      message: 'Face verification marked as successful',
    };
  }

  /**
   * Request password reset
   * Sends OTP to user's email for password reset
   */
  async requestPasswordReset(email: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists for security
      return {
        message: 'If an account with this email exists, a password reset code has been sent.',
      };
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP with type 'password_reset'
    await prisma.oTP.create({
      data: {
        userId: user.id,
        email: user.email,
        code: otp,
        type: 'password_reset',
        expiresAt,
      },
    });

    // Send OTP email
    await sendOTPEmail(user.email, otp, 'password_reset');

    return {
      message: 'If an account with this email exists, a password reset code has been sent.',
    };
  }

  /**
   * Verify password reset OTP
   * Validates the OTP code sent to user's email
   */
  async verifyPasswordResetOTP(email: string, otp: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid email or OTP');
    }

    // Validate OTP
    const otpRecord = await prisma.oTP.findFirst({
      where: {
        userId: user.id,
        email: user.email,
        code: otp,
        type: 'password_reset',
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord) {
      throw new Error('Invalid or expired OTP');
    }

    // Return success without marking OTP as used yet
    // OTP will be marked as used when password is actually reset
    return {
      verified: true,
      message: 'OTP verified successfully. You can now reset your password.',
    };
  }

  /**
   * Reset password with verified OTP
   * This should be called after OTP verification
   */
  async resetPassword(email: string, otp: string, newPassword: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid email or OTP');
    }

    // Validate OTP again (security check)
    const otpRecord = await prisma.oTP.findFirst({
      where: {
        userId: user.id,
        email: user.email,
        code: otp,
        type: 'password_reset',
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord) {
      throw new Error('Invalid or expired OTP. Please request a new password reset.');
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Mark OTP as used
    await prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Invalidate all existing sessions (force re-login)
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    notifyPasswordReset(user.id);

    return {
      message: 'Password reset successfully. Please login with your new password.',
    };
  }

  async getSecuritySettings(userId: string | number) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: {
        verifyTransactionsWithPin: true,
        verifyTransactionsWithEmail: true,
        verifyTransactionsWith2FA: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      verifyWithPin: user.verifyTransactionsWithPin,
      verifyWithEmail: user.verifyTransactionsWithEmail,
      verifyWith2FA: user.verifyTransactionsWith2FA,
    };
  }

  async updateSecuritySettings(
    userId: string | number,
    settings: {
      verifyWithPin?: boolean;
      verifyWithEmail?: boolean;
      verifyWith2FA?: boolean;
    }
  ) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const data: {
      verifyTransactionsWithPin?: boolean;
      verifyTransactionsWithEmail?: boolean;
      verifyTransactionsWith2FA?: boolean;
    } = {};

    if (typeof settings.verifyWithPin === 'boolean') {
      data.verifyTransactionsWithPin = settings.verifyWithPin;
    }
    if (typeof settings.verifyWithEmail === 'boolean') {
      data.verifyTransactionsWithEmail = settings.verifyWithEmail;
    }
    if (typeof settings.verifyWith2FA === 'boolean') {
      if (settings.verifyWith2FA) {
        throw new Error('Two-factor authentication for transactions is coming soon');
      }
      data.verifyTransactionsWith2FA = settings.verifyWith2FA;
    }

    const user = await prisma.user.update({
      where: { id: parsedUserId },
      data,
      select: {
        verifyTransactionsWithPin: true,
        verifyTransactionsWithEmail: true,
        verifyTransactionsWith2FA: true,
      },
    });

    return {
      verifyWithPin: user.verifyTransactionsWithPin,
      verifyWithEmail: user.verifyTransactionsWithEmail,
      verifyWith2FA: user.verifyTransactionsWith2FA,
    };
  }

  async sendTransactionVerificationOTP(userId: string | number) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.verifyTransactionsWithEmail) {
      throw new Error('Email verification for transactions is disabled');
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.oTP.create({
      data: {
        userId: user.id,
        email: user.email,
        code: otpCode,
        type: 'transaction',
        expiresAt,
      },
    });

    await sendOTPEmail(user.email, otpCode, 'transaction');

    return {
      message: 'Transaction verification code sent to your email',
    };
  }

  private parseDeviceLabel(session: {
    deviceName?: string | null;
    userAgent?: string | null;
  }): string {
    if (session.deviceName) {
      return session.deviceName;
    }

    const userAgent = session.userAgent || '';
    if (/iPhone/i.test(userAgent)) return 'iPhone';
    if (/iPad/i.test(userAgent)) return 'iPad';
    if (/Android/i.test(userAgent)) {
      const match = userAgent.match(/Android.*?;\s*([^;)]+)/);
      return match?.[1]?.trim() || 'Android Device';
    }
    if (userAgent) return 'Web Browser';
    return 'Unknown Device';
  }

  async getUserSessions(userId: string | number, currentToken?: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const sessions = await prisma.session.findMany({
      where: {
        userId: parsedUserId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      name: this.parseDeviceLabel(session),
      app: session.userAgent?.includes('RhinoxPay')
        ? session.userAgent
        : 'RhinoxPay Mobile',
      location: session.ipAddress || 'Unknown location',
      isCurrentDevice: Boolean(currentToken && session.token === currentToken),
      lastUsed: session.createdAt,
    }));
  }

  async revokeSession(userId: string | number, sessionId: string | number, currentToken?: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedSessionId = typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId;

    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedSessionId) || parsedSessionId <= 0) {
      throw new Error('Invalid session ID format');
    }

    const session = await prisma.session.findFirst({
      where: {
        id: parsedSessionId,
        userId: parsedUserId,
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    await prisma.session.delete({
      where: { id: session.id },
    });

    return {
      revokedCurrentSession: Boolean(currentToken && session.token === currentToken),
      message: 'Session terminated successfully',
    };
  }

  async revokeOtherSessions(userId: string | number, currentToken?: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    if (!currentToken) {
      throw new Error('Current session token is required');
    }

    const result = await prisma.session.deleteMany({
      where: {
        userId: parsedUserId,
        token: {
          not: currentToken,
        },
      },
    });

    return {
      revokedCount: result.count,
      message: 'Other sessions terminated successfully',
    };
  }

  async logout(userId: string | number, token?: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    if (token) {
      await prisma.session.deleteMany({
        where: {
          userId: parsedUserId,
          token,
        },
      });
    }

    return {
      message: 'Logged out successfully',
    };
  }
}

