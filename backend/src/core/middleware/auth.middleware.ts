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
    const token =
      (req.cookies?.token as string) ||
      (req.headers.authorization?.split(' ')[1] as string);

    if (!token) {
      throw ApiError.unauthorized('You are not logged in');
    }

    const decoded = await verifyToken(token);

    if (!decoded) {
      throw ApiError.unauthorized('You are not logged in');
    }

    const isUser = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },
    });

    if (!isUser) {
      throw ApiError.unauthorized('You are not logged in');
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
    next(ApiError.internal('Something went wrong'));
  }
};

export default authenticateUser;
export { authenticateUser as authMiddleware };

