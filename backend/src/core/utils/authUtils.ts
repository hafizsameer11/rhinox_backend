import jwt from 'jsonwebtoken';

/**
 * Verify JWT Access Token
 * @param token - JWT access token to verify
 * @returns Decoded token payload or null if invalid
 * @note This function ONLY accepts access tokens (signed with JWT_SECRET)
 *       Refresh tokens should NOT be used for API authentication
 */
export const verifyToken = async (token: string): Promise<{ id: string | number; userId?: string | number } | null> => {
  try {
    // ONLY verify with JWT_SECRET (access tokens only)
    // Refresh tokens should NOT be accepted here for security
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret) as {
      userId?: string | number;
      id?: string | number;
      type?: string; // Check if it's a refresh token (should be rejected)
      iat?: number;
      exp?: number;
    };

    // Reject refresh tokens even if they're signed with JWT_SECRET
    if (decoded.type === 'refresh') {
      return null;
    }

    // Extract userId - it could be in userId or id field
    const userId = decoded.userId ?? decoded.id;
    if (!userId && userId !== 0) {
      return null;
    }

    return {
      id: userId,
      userId: userId,
    };
  } catch (error: any) {
    // Token is invalid or expired
    // Log the error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('[verifyToken] Error:', error.message);
      console.error('[verifyToken] Using secret:', secret.substring(0, 10) + '...');
    }
    return null;
  }
};


/**
 * Generate Access Token
 * @param userId - User ID to encode in token
 * @returns JWT access token
 */
export const generateAccessToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};


