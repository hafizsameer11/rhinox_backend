import jwt from 'jsonwebtoken';

/**
 * Verify JWT Token
 * @param token - JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export const verifyToken = async (token: string): Promise<{ id: string; userId?: string } | null> => {
  try {
    // Try with JWT_SECRET first (for access tokens)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as {
        userId: string;
        id?: string;
      };

      return {
        id: decoded.userId || decoded.id || '',
        userId: decoded.userId || decoded.id,
      };
    } catch (error) {
      // If that fails, try with REFRESH_TOKEN_SECRET (for refresh tokens)
      try {
        const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret') as {
          userId: string;
          id?: string;
        };

        return {
          id: decoded.userId || decoded.id || '',
          userId: decoded.userId || decoded.id,
        };
      } catch (refreshError) {
        return null;
      }
    }
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

