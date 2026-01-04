import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import prisma from '../../core/config/database.js';
import { generateOTP, sendOTPEmail } from '../../core/utils/email.service.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { parseOptionalId } from '../../core/utils/idParser.js';

/**
 * Auth Service
 * Business logic for authentication
 */
export class AuthService {

  /**
   * Register a new user
   */
  async register(data: {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    countryId?: string;
    termsAccepted: boolean;
  }) {
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
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user (not verified yet)
    const userData: any = {
      email: data.email,
      phone: data.phone,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      termsAccepted: data.termsAccepted,
      isEmailVerified: false, // Will be verified after OTP
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
    const tokens = this.generateTokens(user.id);

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token: tokens.accessToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      },
    });

    // Return user with tokens (email verification still required but user can use app)
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: false,
      },
      ...tokens,
      message: 'Registration successful. Please verify your email with the OTP sent to your email.',
    };
  }

  /**
   * Login user
   */
  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
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

    // Generate tokens
    const tokens = this.generateTokens(user.id);

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
    
    await prisma.session.create({
      data: sessionData,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
    // Find valid OTP
    const otp = await prisma.oTP.findFirst({
      where: {
        userId,
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
      where: { id: userId },
      data: {
        isEmailVerified: true,
      },
    });

    // Initialize crypto wallets after email verification (async, don't wait)
    this.initializeCryptoWallets(user.id).catch(error => {
      console.error('Failed to initialize crypto wallets:', error);
    });

    // Initialize fiat wallets after email verification (async, don't wait)
    this.initializeFiatWallets(user.id).catch(error => {
      console.error('Failed to initialize fiat wallets:', error);
    });

    // Generate tokens after verification
    const tokens = this.generateTokens(user.id);

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
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        userId,
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      where: { id: userId },
      data: { pinHash },
    });

    return {
      message: 'PIN setup successfully',
    };
  }

  /**
   * Change PIN
   */
  async changePIN(userId: string, oldPin: string, newPin: string) {
    // Validate new PIN
    if (!/^\d{5}$/.test(newPin)) {
      throw new Error('New PIN must be exactly 5 digits');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      where: { id: userId },
      data: { pinHash },
    });

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
   * Initialize crypto wallets for user (called after email verification)
   */
  private async initializeCryptoWallets(userId: string | number) {
    try {
      console.log(`🚀 Starting crypto wallet initialization for user ${userId}...`);
      const cryptoService = new CryptoService();
      const result = await cryptoService.initializeUserCryptoWallets(userId);
      console.log(`✅ Successfully initialized ${result.length} crypto virtual accounts for user ${userId}`);
    } catch (error: any) {
      console.error(`❌ Failed to initialize crypto wallets for user ${userId}:`, error.message || error);
      // Don't throw - this is a background operation
    }
  }

  /**
   * Initialize fiat wallets for user (called after email verification)
   * Creates wallets for ALL active fiat currencies in the database
   */
  private async initializeFiatWallets(userId: number | string) {
    try {
      const walletService = new WalletService();
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;

      // Get user to verify they exist
      const user = await prisma.user.findUnique({
        where: { id: userIdNum },
      });

      if (!user) {
        console.error(`User ${userId} not found for fiat wallet initialization`);
        return;
      }

      // Get ALL active fiat currencies from database
      const fiatCurrencies = await prisma.currency.findMany({
        where: {
          type: 'fiat',
          isActive: true,
        },
        orderBy: {
          code: 'asc',
        },
      });

      if (fiatCurrencies.length === 0) {
        console.log('No active fiat currencies found in database');
        return;
      }

      console.log(`Creating ${fiatCurrencies.length} fiat wallets for user ${userId}`);

      // Create wallets for each fiat currency
      for (const currency of fiatCurrencies) {
        try {
          // Check if wallet already exists
          const existingWallet = await prisma.wallet.findUnique({
            where: {
              userId_currency: {
                userId: userIdNum,
                currency: currency.code,
              },
            },
          });

          if (existingWallet) {
            console.log(`Wallet for ${currency.code} already exists for user ${userId}`);
            continue;
          }

          // Create wallet
          await walletService.createWallet(String(userIdNum), currency.code, 'fiat');
          console.log(`✅ Created fiat wallet for ${currency.code} (${currency.name}) for user ${userId}`);
        } catch (error: any) {
          // If wallet already exists, that's fine - continue
          if (error.message?.includes('already exists')) {
            console.log(`Wallet for ${currency.code} already exists for user ${userId}`);
            continue;
          }
          console.error(`❌ Failed to create wallet for ${currency.code}:`, error.message || error);
        }
      }
    } catch (error) {
      console.error(`Failed to initialize fiat wallets for user ${userId}:`, error);
      // Don't throw - this is a background operation
    }
  }
}

