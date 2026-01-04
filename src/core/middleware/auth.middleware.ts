import { type Request, type Response, type NextFunction } from 'express';
import ApiError from '../utils/ApiError.js';
import { verifyToken } from '../utils/authUtils.js';
import { prisma } from '../config/database.js';

/**
 * Authentication Middleware
 * Validates JWT tokens and attaches user info to request
 */
const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract token from Authorization header or cookies
    let token: string | undefined;
    
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else if (req.cookies?.token) {
      token = req.cookies.token as string;
    }

    if (!token) {
      throw ApiError.unauthorized('You are not logged in');
    }

    const decoded = await verifyToken(token);

    if (!decoded) {
      // Log error in development to help debug
      if (process.env.NODE_ENV === 'development') {
        console.error('[Auth Middleware] Token verification failed for token:', token.substring(0, 20) + '...');
      }
      throw ApiError.unauthorized('Invalid or expired token');
    }

    // Handle both string and number IDs (convert to number for database query)
    let userId: number;
    const idValue = decoded.id ?? decoded.userId;
    
    if (!idValue) {
      throw ApiError.unauthorized('User ID not found in token');
    }

    if (typeof idValue === 'string') {
      userId = parseInt(idValue, 10);
      if (isNaN(userId)) {
        throw ApiError.unauthorized('Invalid user ID format in token');
      }
    } else if (typeof idValue === 'number') {
      userId = idValue;
    } else {
      throw ApiError.unauthorized('Invalid user ID format in token');
    }

    if (userId <= 0) {
      throw ApiError.unauthorized('Invalid user ID in token');
    }

    const isUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!isUser) {
      throw ApiError.unauthorized('User not found');
    }

    // Attach user to request (ensure req.body exists first)
    if (!req.body) {
      req.body = {};
    }
    req.body._user = isUser;
    (req as any).user = isUser;
    (req as any).userId = isUser.id;

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    // Log the actual error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('[Auth Middleware] Unexpected error:', error);
      if (error instanceof Error) {
        console.error('[Auth Middleware] Error message:', error.message);
        console.error('[Auth Middleware] Error stack:', error.stack);
      }
    }
    next(ApiError.internal('Something went wrong'));
  }
};

export default authenticateUser;
export { authenticateUser as authMiddleware };

