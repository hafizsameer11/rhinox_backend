import { type Request, type Response } from 'express';
import { P2PReviewService } from './p2p-review.service.js';

/**
 * P2P Review Controller
 * Handles HTTP requests for P2P reviews
 */
export class P2PReviewController {
  constructor(private service: P2PReviewService) {}

  /**
   * @swagger
   * /api/p2p/orders/{orderId}/review:
   *   post:
   *     summary: Create review for completed order
   *     description: |
   *       Create a review for a completed P2P order. Only the buyer can leave a review for the vendor.
   *       Reviews can be positive (thumbs up) or negative (thumbs down) with an optional comment.
   *     tags: [P2P Review]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - type
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [positive, negative]
   *                 example: "positive"
   *                 description: Review type - positive (thumbs up) or negative (thumbs down)
   *               comment:
   *                 type: string
   *                 maxLength: 500
   *                 example: "He is fast and reliable"
   *                 description: Optional review comment
   *     responses:
   *       201:
   *         description: Review created successfully
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
   *                     id:
   *                       type: integer
   *                       example: 1
   *                     orderId:
   *                       type: integer
   *                       example: 1
   *                     adId:
   *                       type: integer
   *                       example: 1
   *                     type:
   *                       type: string
   *                       enum: [positive, negative]
   *                     comment:
   *                       type: string
   *                       nullable: true
   *                     reviewer:
   *                       type: object
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Order not found"
   *           - "Can only review completed orders"
   *           - "Only buyer can leave a review"
   *           - "Review already exists for this order"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async createReview(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { orderId } = req.params;
      const { type, comment } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!type || !['positive', 'negative'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Review type must be "positive" or "negative"',
        });
      }

      if (comment && comment.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Comment must not exceed 500 characters',
        });
      }

      const review = await this.service.createReview(orderId, userId, {
        type: type as 'positive' | 'negative',
        comment: comment || undefined,
      });

      return res.status(201).json({
        success: true,
        data: review,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create review',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/vendors/{vendorId}/reviews:
   *   get:
   *     summary: Get all reviews for a vendor
   *     description: |
   *       Get all reviews left for a specific vendor. Can filter by review type (positive/negative).
   *       Results are paginated and sorted by creation date (newest first).
   *     tags: [P2P Review]
   *     parameters:
   *       - in: path
   *         name: vendorId
   *         required: true
   *         schema:
   *           type: integer
   *         example: 2
   *         description: Vendor user ID
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [positive, negative]
   *         description: Filter by review type
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: List of vendor reviews
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       orderId:
   *                         type: string
   *                       adId:
   *                         type: string
   *                       type:
   *                         type: string
   *                         enum: [positive, negative]
   *                       comment:
   *                         type: string
   *                         nullable: true
   *                       reviewer:
   *                         type: object
   *                       order:
   *                         type: object
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   */
  async getVendorReviews(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      const filters = {
        type: req.query.type as 'positive' | 'negative' | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const reviews = await this.service.getVendorReviews(vendorId, filters);

      return res.json({
        success: true,
        data: reviews,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get vendor reviews',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/ads/{adId}/reviews:
   *   get:
   *     summary: Get reviews for a specific ad
   *     description: |
   *       Get all reviews for a specific P2P ad. Can filter by review type (positive/negative).
   *       Results are paginated and sorted by creation date (newest first).
   *     tags: [P2P Review]
   *     parameters:
   *       - in: path
   *         name: adId
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Ad ID
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [positive, negative]
   *         description: Filter by review type
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: List of ad reviews
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       orderId:
   *                         type: string
   *                       adId:
   *                         type: string
   *                       type:
   *                         type: string
   *                         enum: [positive, negative]
   *                       comment:
   *                         type: string
   *                         nullable: true
   *                       reviewer:
   *                         type: object
   *                       order:
   *                         type: object
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   */
  async getAdReviews(req: Request, res: Response) {
    try {
      const { adId } = req.params;
      const filters = {
        type: req.query.type as 'positive' | 'negative' | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const reviews = await this.service.getAdReviews(adId, filters);

      return res.json({
        success: true,
        data: reviews,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get ad reviews',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/reviews/{id}:
   *   put:
   *     summary: Update review
   *     description: |
   *       Update a review. Only the reviewer can update their own review.
   *       Can only update within 24 hours of creation.
   *     tags: [P2P Review]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Review ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [positive, negative]
   *                 description: Review type
   *               comment:
   *                 type: string
   *                 maxLength: 500
   *                 description: Review comment
   *     responses:
   *       200:
   *         description: Review updated successfully
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Review not found"
   *           - "Only reviewer can update their review"
   *           - "Can only update review within 24 hours of creation"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async updateReview(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;
      const { type, comment } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (type && !['positive', 'negative'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Review type must be "positive" or "negative"',
        });
      }

      if (comment && comment.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Comment must not exceed 500 characters',
        });
      }

      const review = await this.service.updateReview(id, userId, {
        type: type as 'positive' | 'negative' | undefined,
        comment: comment || undefined,
      });

      return res.json({
        success: true,
        data: review,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update review',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/reviews/{id}:
   *   delete:
   *     summary: Delete review
   *     description: |
   *       Delete a review. Only the reviewer can delete their own review.
   *       Can only delete within 24 hours of creation.
   *     tags: [P2P Review]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Review ID
   *     responses:
   *       200:
   *         description: Review deleted successfully
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Review not found"
   *           - "Only reviewer can delete their review"
   *           - "Can only delete review within 24 hours of creation"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async deleteReview(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.deleteReview(id, userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete review',
      });
    }
  }
}

