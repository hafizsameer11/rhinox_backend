import jwt from 'jsonwebtoken';

/**
 * Verify JWT Access Token
 * @param token - JWT access token to verify
 * @returns Decoded token payload or null if invalid
 * @note This function ONLY accepts access tokens (signed with JWT_SECRET)
 *       Refresh tokens should NOT be used for API authentication
 */
export const verifyToken = async (token: string): Promise<{ id: string; userId?: string } | null> => {
  try {
    // ONLY verify with JWT_SECRET (access tokens only)
    // Refresh tokens should NOT be accepted here for security
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as {
      userId: string;
      id?: string;
      type?: string; // Check if it's a refresh token (should be rejected)
    };

    // Reject refresh tokens even if they're signed with JWT_SECRET
    if (decoded.type === 'refresh') {
      return null;
    }

    return {
      id: decoded.userId || decoded.id || '',
      userId: decoded.userId || decoded.id,
    };
  } catch (error) {
    // Token is invalid or expired
    return null;
  }
};

/**
 * Verify Refresh Token (separate function for refresh endpoint only)
 * @param token - JWT refresh token to verify
 * @returns Decoded token payload or null if invalid
 */
export const verifyRefreshToken = async (token: string): Promise<{ id: string; userId?: string } | null> => {
  try {
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret') as {
      userId: string;
      id?: string;
      type?: string;
    };

    // Ensure it's actually a refresh token
    if (decoded.type !== 'refresh') {
      return null;
    }

    return {
      id: decoded.userId || decoded.id || '',
      userId: decoded.userId || decoded.id,
    };
  } catch (error) {
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

/**
 * Generate Refresh Token
 * @param userId - User ID to encode in token
 * @returns JWT refresh token
 */
export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret',
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d' }
  );
};

