import prisma from '../../core/config/database.js';

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
    // Check if KYC already exists
    const existingKYC = await prisma.kYC.findUnique({
      where: { userId },
    });

    // Update user basic info if provided
    if (data.firstName || data.lastName || data.middleName || data.countryId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.middleName && { middleName: data.middleName }),
          ...(data.countryId && { countryId: data.countryId }),
        },
      });
    }

    if (existingKYC) {
      // Update existing KYC
      const kyc = await prisma.kYC.update({
        where: { userId },
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
          userId,
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          dateOfBirth: data.dateOfBirth,
          idType: data.idType,
          idNumber: data.idNumber,
          idDocumentUrl: data.idDocumentUrl,
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
   */
  async getKYCStatus(userId: string) {
    const kyc = await prisma.kYC.findUnique({
      where: { userId },
    });

    if (!kyc) {
      return {
        hasKYC: false,
        status: 'not_started',
        tier: 0,
      };
    }

    return {
      hasKYC: true,
      id: kyc.id,
      tier: kyc.tier,
      status: kyc.status,
      firstName: kyc.firstName,
      lastName: kyc.lastName,
      middleName: kyc.middleName,
      dateOfBirth: kyc.dateOfBirth,
      idType: kyc.idType,
      idNumber: kyc.idNumber,
      faceVerificationSuccessful: kyc.faceVerificationSuccessful,
      verifiedAt: kyc.verifiedAt,
      createdAt: kyc.createdAt,
      updatedAt: kyc.updatedAt,
    };
  }

  /**
   * Submit face verification
   */
  async submitFaceVerification(userId: string, imageUrl: string, isSuccessful: boolean) {
    const kyc = await prisma.kYC.findUnique({
      where: { userId },
    });

    if (!kyc) {
      throw new Error('KYC not found. Please complete KYC registration first.');
    }

    const updatedKYC = await prisma.kYC.update({
      where: { userId },
      data: {
        faceVerificationImageUrl: imageUrl,
        faceVerificationSuccessful: isSuccessful,
        ...(isSuccessful && { status: 'verified', verifiedAt: new Date() }),
      },
    });

    return {
      id: updatedKYC.id,
      faceVerificationSuccessful: updatedKYC.faceVerificationSuccessful,
      status: updatedKYC.status,
      verifiedAt: updatedKYC.verifiedAt,
    };
  }

  /**
   * Upload ID document
   */
  async uploadIDDocument(userId: string, documentUrl: string, idType: string, idNumber: string) {
    const kyc = await prisma.kYC.findUnique({
      where: { userId },
    });

    if (!kyc) {
      throw new Error('KYC not found. Please complete KYC registration first.');
    }

    const updatedKYC = await prisma.kYC.update({
      where: { userId },
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
    const kyc = await prisma.kYC.findUnique({
      where: { userId },
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
      throw new Error('KYC is already approved');
    }

    // Update KYC status to verified
    const updatedKYC = await prisma.kYC.update({
      where: { userId },
      data: {
        status: 'verified',
        verifiedAt: new Date(),
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

    return {
      id: updatedKYC.id,
      userId: updatedKYC.userId,
      status: updatedKYC.status,
      verifiedAt: updatedKYC.verifiedAt,
      user: updatedKYC.user,
      message: 'KYC approved successfully',
    };
  }

  /**
   * Admin: Reject KYC
   */
  async rejectKYC(userId: string, reason?: string) {
    const kyc = await prisma.kYC.findUnique({
      where: { userId },
    });

    if (!kyc) {
      throw new Error('KYC not found for this user');
    }

    if (kyc.status === 'rejected') {
      throw new Error('KYC is already rejected');
    }

    // Update KYC status to rejected
    const updatedKYC = await prisma.kYC.update({
      where: { userId },
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

