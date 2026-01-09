import jwt from 'jsonwebtoken';

/**
 * Verify JWT Access Token
 * @param token - JWT access token to verify
 * @returns Decoded token payload or null if invalid
 * @note This function ONLY accepts access tokens (signed with JWT_SECRET)
 *       Refresh tokens should NOT be used for API authentication
 */
export const verifyToken = async (token: string): Promise<{ id: string | number; userId?: string | number } | null> => {
  // ONLY verify with JWT_SECRET (access tokens only)
  // Refresh tokens should NOT be accepted here for security
  const secret = process.env.ACCESS_TOKEN_SECRET || 'e97c25d5-90f8-4e3f-939c-b1ab2cac407d';
  
  try {
    const decoded = jwt.verify(token, secret) as {
      userId?: string | number;
      id?: string | number;
      type?: string; // Check if it's a refresh token (should be rejected)
      iat?: number;
      exp?: number;
    };

    // Log decoded token in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[verifyToken] Decoded token:', {
        userId: decoded.userId,
        id: decoded.id,
        type: decoded.type,
        exp: decoded.exp,
        expDate: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
        now: new Date().toISOString(),
      });
    }

    // Reject refresh tokens even if they're signed with JWT_SECRET
    if (decoded.type === 'refresh') {
      if (process.env.NODE_ENV === 'development') {
        console.error('[verifyToken] Rejected: Token is a refresh token');
      }
      return null;
    }

    // Extract userId - it could be in userId or id field
    const userId = decoded.userId ?? decoded.id;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[verifyToken] Extracted userId:', userId, 'type:', typeof userId);
    }
    
    // Check if userId exists (handle both 0 and other falsy values correctly)
    if (userId === undefined || userId === null || userId === '') {
      if (process.env.NODE_ENV === 'development') {
        console.error('[verifyToken] Rejected: No userId found in token');
      }
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
      console.error('[verifyToken] Error name:', error.name);
      if (error.name === 'TokenExpiredError') {
        console.error('[verifyToken] Token expired at:', new Date(error.expiredAt).toISOString());
      }
      if (error.name === 'JsonWebTokenError') {
        console.error('[verifyToken] JWT Error - possible secret mismatch');
      }
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
  const secret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET || 'your-secret-key';
  if (!secret) {
    throw new Error('JWT_SECRET or ACCESS_TOKEN_SECRET must be set');
  }
  const payload = { userId };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};


