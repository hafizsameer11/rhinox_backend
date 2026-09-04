import prisma from '../../core/config/database.js';
import { parseOptionalId, parseId } from '../../core/utils/idParser.js';

/**
 * KYC Service
 * Business logic for KYC verification
 */
export class KYCService {
  /**
   * Submit or update KYC information
   */
  async submitKYC(userId: string, data: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    dateOfBirth?: Date;
    idType?: string;
    idNumber?: string;
    idDocumentUrl?: string;
    countryId?: string;
  }) {
    // Check if KYC already exists (parse userId to integer)
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    const existingKYC = await prisma.kYC.findUnique({
      where: { userId: parsedUserId },
    });

    // Update user basic info if provided
    if (data.firstName || data.lastName || data.middleName || data.countryId) {
      const parsedCountryId = data.countryId ? parseOptionalId(data.countryId, 'countryId') : undefined;
      await prisma.user.update({
        where: { id: typeof userId === 'string' ? parseInt(userId, 10) : userId },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.middleName && { middleName: data.middleName }),
          ...(parsedCountryId && { countryId: parsedCountryId }),
        },
      });
    }

    if (existingKYC) {
      // Update existing KYC
      const kyc = await prisma.kYC.update({
        where: { userId: parsedUserId },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.middleName && { middleName: data.middleName }),
          ...(data.dateOfBirth && { dateOfBirth: data.dateOfBirth }),
          ...(data.idType && { idType: data.idType }),
          ...(data.idNumber && { idNumber: data.idNumber }),
          ...(data.idDocumentUrl && { idDocumentUrl: data.idDocumentUrl }),
          status: 'pending', // Reset to pending when updated
        },
      });

      return {
        id: kyc.id,
        userId: kyc.userId,
        tier: kyc.tier,
        status: kyc.status,
        firstName: kyc.firstName,
        lastName: kyc.lastName,
        middleName: kyc.middleName,
        dateOfBirth: kyc.dateOfBirth,
        idType: kyc.idType,
        idNumber: kyc.idNumber,
        faceVerificationSuccessful: kyc.faceVerificationSuccessful,
        createdAt: kyc.createdAt,
        updatedAt: kyc.updatedAt,
      };
    } else {
      // Create new KYC
      const kyc = await prisma.kYC.create({
        data: {
          userId: parsedUserId,
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.middleName && { middleName: data.middleName }),
          ...(data.dateOfBirth && { dateOfBirth: data.dateOfBirth }),
          ...(data.idType && { idType: data.idType }),
          ...(data.idNumber && { idNumber: data.idNumber }),
          ...(data.idDocumentUrl && { idDocumentUrl: data.idDocumentUrl }),
          status: 'pending',
          tier: 1,
        },
      });

      return {
        id: kyc.id,
        userId: kyc.userId,
        tier: kyc.tier,
        status: kyc.status,
        firstName: kyc.firstName,
        lastName: kyc.lastName,
        middleName: kyc.middleName,
        dateOfBirth: kyc.dateOfBirth,
        idType: kyc.idType,
        idNumber: kyc.idNumber,
        faceVerificationSuccessful: kyc.faceVerificationSuccessful,
        createdAt: kyc.createdAt,
        updatedAt: kyc.updatedAt,
      };
    }
  }

  /**
   * Get user KYC status
   * "verified" is only returned after Busha customer.status === active
   */
  async getKYCStatus(userId: string | number) {
    const parsedUserId = parseId(userId, 'userId');
    
    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[KYC Service] getKYCStatus - userId:', userId, 'parsedUserId:', parsedUserId);
    }
    
    const [kyc, bushaCustomer] = await Promise.all([
      prisma.kYC.findUnique({
        where: { userId: parsedUserId },
        include: {
          user: {
            select: {
              countryId: true,
              country: { select: { id: true, name: true, code: true } },
            },
          },
        },
      }),
      prisma.bushaCustomer.findUnique({ where: { userId: parsedUserId } }),
    ]);

    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[KYC Service] getKYCStatus - KYC found:', !!kyc, kyc ? { id: kyc.id, status: kyc.status, userId: kyc.userId } : null);
    }

    if (!kyc) {
      return {
        hasKYC: false,
        status: 'not_started',
        tier: 0,
        bushaStatus: bushaCustomer?.status || 'missing',
      };
    }

    const bushaStatus = String(bushaCustomer?.status || 'missing').toLowerCase();
    let status = kyc.status;
    let verifiedAt = kyc.verifiedAt;

    if (bushaStatus === 'active') {
      status = 'verified';
      if (kyc.status !== 'verified') {
        const updated = await prisma.kYC.update({
          where: { userId: parsedUserId },
          data: { status: 'verified', verifiedAt: new Date() },
        });
        verifiedAt = updated.verifiedAt;
      }
    } else if (bushaStatus === 'rejected') {
      status = 'rejected';
    } else if (['in_review', 'pending', 'submitted', 'inactive'].includes(bushaStatus)) {
      status = 'under_review';
      verifiedAt = null;
    } else if (status === 'verified' && bushaStatus !== 'active') {
      // Legacy: face/admin marked verified before Busha — do not show Verified yet
      status = kyc.faceVerificationSuccessful ? 'under_review' : 'pending';
      verifiedAt = null;
    }

    return {
      hasKYC: true,
      id: kyc.id,
      tier: kyc.tier,
      status,
      kycStatus: status,
      firstName: kyc.firstName,
      lastName: kyc.lastName,
      middleName: kyc.middleName,
      dateOfBirth: kyc.dateOfBirth,
      idType: kyc.idType,
      idNumber: kyc.idNumber,
      faceVerificationSuccessful: kyc.faceVerificationSuccessful,
      faceVerificationImageUrl: kyc.faceVerificationImageUrl,
      countryId: kyc.user?.countryId || kyc.user?.country?.id || null,
      countryCode: kyc.user?.country?.code || null,
      countryName: kyc.user?.country?.name || null,
      verifiedAt,
      bushaStatus,
      createdAt: kyc.createdAt,
      updatedAt: kyc.updatedAt,
    };
  }

  /**
   * Submit face verification
   * Does NOT mark KYC verified — Busha approval (webhook/sync) owns that.
   */
  async submitFaceVerification(userId: string, imageUrl: string, isSuccessful: boolean) {
    const parsedUserId = parseId(userId, 'userId');
    const kyc = await prisma.kYC.findUnique({
      where: { userId: parsedUserId },
    });

    if (!kyc) {
      throw new Error('KYC not found. Please complete KYC registration first.');
    }

    const updatedKYC = await prisma.kYC.update({
      where: { userId: parsedUserId },
      data: {
        faceVerificationImageUrl: imageUrl,
        faceVerificationSuccessful: isSuccessful,
        // Documents + face ready for Busha review; keep pending until Busha is active
        ...(isSuccessful &&
          kyc.status !== 'verified' && {
            status: 'pending',
            verifiedAt: null,
          }),
      },
    });

    return {
      id: updatedKYC.id,
      faceVerificationSuccessful: updatedKYC.faceVerificationSuccessful,
      status: updatedKYC.status,
      verifiedAt: updatedKYC.verifiedAt,
      message: isSuccessful
        ? 'Face verification saved. Account stays unverified until crypto KYC is approved.'
        : undefined,
    };
  }

  /**
   * Upload ID document
   */
  async uploadIDDocument(userId: string, documentUrl: string, idType: string, idNumber: string) {
    const parsedUserId = parseId(userId, 'userId');
    const kyc = await prisma.kYC.findUnique({
      where: { userId: parsedUserId },
    });

    if (!kyc) {
      throw new Error('KYC not found. Please complete KYC registration first.');
    }

    const updatedKYC = await prisma.kYC.update({
      where: { userId: parsedUserId },
      data: {
        idDocumentUrl: documentUrl,
        idType,
        idNumber,
        status: 'pending', // Reset to pending for review
      },
    });

    return {
      id: updatedKYC.id,
      idType: updatedKYC.idType,
      idNumber: updatedKYC.idNumber,
      idDocumentUrl: updatedKYC.idDocumentUrl,
      status: updatedKYC.status,
    };
  }

  /**
   * Admin: Approve KYC
   */
  async approveKYC(userId: string, adminUserId?: string) {
    const parsedUserId = parseId(userId, 'userId');
    const kyc = await prisma.kYC.findUnique({
      where: { userId: parsedUserId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!kyc) {
      throw new Error('KYC not found for this user');
    }

    if (kyc.status === 'verified') {
      const busha = await prisma.bushaCustomer.findUnique({ where: { userId: parsedUserId } });
      if (busha?.status === 'active') {
        throw new Error('KYC is already approved');
      }
    }

    // Admin only clears local docs review — final Verified comes from Busha webhook
    const updatedKYC = await prisma.kYC.update({
      where: { userId: parsedUserId },
      data: {
        status: 'pending',
        verifiedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Kick off / requeue Busha KYC when platform is live
    try {
      const { BushaAppService, isBushaEnabled } = await import('../../services/busha/index.js');
      if (isBushaEnabled()) {
        await new BushaAppService().startKyc(parsedUserId);
      }
    } catch (error: any) {
      console.warn('[KYC] Admin approve: Busha start skipped:', error?.message || error);
    }

    return {
      id: updatedKYC.id,
      userId: updatedKYC.userId,
      status: updatedKYC.status,
      verifiedAt: updatedKYC.verifiedAt,
      user: updatedKYC.user,
      message:
        'Documents accepted. Account will show Verified after Busha KYC approval.',
    };
  }

  /**
   * Admin: Reject KYC
   */
  async rejectKYC(userId: string, reason?: string) {
    const parsedUserId = parseId(userId, 'userId');
    const kyc = await prisma.kYC.findUnique({
      where: { userId: parsedUserId },
    });

    if (!kyc) {
      throw new Error('KYC not found for this user');
    }

    if (kyc.status === 'rejected') {
      throw new Error('KYC is already rejected');
    }

    // Update KYC status to rejected
    const updatedKYC = await prisma.kYC.update({
      where: { userId: parsedUserId },
      data: {
        status: 'rejected',
      },
    });

    return {
      id: updatedKYC.id,
      userId: updatedKYC.userId,
      status: updatedKYC.status,
      reason: reason || 'KYC verification failed',
      message: 'KYC rejected',
    };
  }
}

