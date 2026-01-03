import prisma from '../../core/config/database.js';

/**
 * P2P Review Service
 * Manages reviews left by users after order completion
 */
export class P2PReviewService {
  /**
   * Create review after order completion
   */
  async createReview(
    orderId: string,
    reviewerId: string,
    data: {
      type: 'positive' | 'negative';
      comment?: string;
    }
  ) {
    // Verify order exists and is completed
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
      include: {
        ad: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'completed') {
      throw new Error('Can only review completed orders');
    }

    // Verify reviewer is the buyer
    if (order.buyerId !== reviewerId) {
      throw new Error('Only buyer can leave a review');
    }

    // Check if review already exists
    const existingReview = await prisma.p2PReview.findUnique({
      where: { orderId },
    });

    if (existingReview) {
      throw new Error('Review already exists for this order');
    }

    // Create review
    const review = await prisma.p2PReview.create({
      data: {
        orderId,
        reviewerId,
        revieweeId: order.vendorId, // Vendor is being reviewed
        adId: order.adId,
        type: data.type,
        comment: data.comment || null,
      },
      include: {
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      id: review.id,
      orderId: review.orderId,
      adId: review.adId,
      type: review.type,
      comment: review.comment,
      reviewer: review.reviewer,
      createdAt: review.createdAt,
    };
  }

  /**
   * Get all reviews for a vendor
   */
  async getVendorReviews(vendorId: string, filters?: {
    type?: 'positive' | 'negative';
    limit?: number;
    offset?: number;
  }) {
    const where: any = {
      revieweeId: vendorId,
    };

    if (filters?.type) {
      where.type = filters.type;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const reviews = await prisma.p2PReview.findMany({
      where,
      include: {
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        order: {
          select: {
            id: true,
            cryptoCurrency: true,
            fiatCurrency: true,
            cryptoAmount: true,
            fiatAmount: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return reviews.map(review => ({
      id: review.id,
      orderId: review.orderId,
      adId: review.adId,
      type: review.type,
      comment: review.comment,
      reviewer: review.reviewer,
      order: {
        id: review.order.id,
        cryptoCurrency: review.order.cryptoCurrency,
        fiatCurrency: review.order.fiatCurrency,
        cryptoAmount: review.order.cryptoAmount.toString(),
        fiatAmount: review.order.fiatAmount.toString(),
      },
      createdAt: review.createdAt,
    }));
  }

  /**
   * Get reviews for a specific ad
   */
  async getAdReviews(adId: string, filters?: {
    type?: 'positive' | 'negative';
    limit?: number;
    offset?: number;
  }) {
    const where: any = {
      adId,
    };

    if (filters?.type) {
      where.type = filters.type;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const reviews = await prisma.p2PReview.findMany({
      where,
      include: {
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        order: {
          select: {
            id: true,
            cryptoCurrency: true,
            fiatCurrency: true,
            cryptoAmount: true,
            fiatAmount: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return reviews.map(review => ({
      id: review.id,
      orderId: review.orderId,
      adId: review.adId,
      type: review.type,
      comment: review.comment,
      reviewer: review.reviewer,
      order: {
        id: review.order.id,
        cryptoCurrency: review.order.cryptoCurrency,
        fiatCurrency: review.order.fiatCurrency,
        cryptoAmount: review.order.cryptoAmount.toString(),
        fiatAmount: review.order.fiatAmount.toString(),
      },
      createdAt: review.createdAt,
    }));
  }

  /**
   * Update review
   */
  async updateReview(
    reviewId: string,
    reviewerId: string,
    data: {
      type?: 'positive' | 'negative';
      comment?: string;
    }
  ) {
    const review = await prisma.p2PReview.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new Error('Review not found');
    }

    if (review.reviewerId !== reviewerId) {
      throw new Error('Only reviewer can update their review');
    }

    // Can only update within 24 hours
    const hoursSinceCreation = (Date.now() - review.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      throw new Error('Can only update review within 24 hours of creation');
    }

    const updated = await prisma.p2PReview.update({
      where: { id: reviewId },
      data: {
        type: data.type || review.type,
        comment: data.comment !== undefined ? data.comment : review.comment,
      },
      include: {
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      orderId: updated.orderId,
      adId: updated.adId,
      type: updated.type,
      comment: updated.comment,
      reviewer: updated.reviewer,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete review
   */
  async deleteReview(reviewId: string, reviewerId: string) {
    const review = await prisma.p2PReview.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new Error('Review not found');
    }

    if (review.reviewerId !== reviewerId) {
      throw new Error('Only reviewer can delete their review');
    }

    // Can only delete within 24 hours
    const hoursSinceCreation = (Date.now() - review.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      throw new Error('Can only delete review within 24 hours of creation');
    }

    await prisma.p2PReview.delete({
      where: { id: reviewId },
    });

    return {
      success: true,
      message: 'Review deleted successfully',
    };
  }
}

