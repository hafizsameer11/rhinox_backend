import { type Request, type Response } from 'express';
import { KYCService } from './kyc.service.js';

/**
 * KYC Controller
 * Handles HTTP requests for KYC operations
 */
export class KYCController {
  constructor(private service: KYCService) {}

  /**
   * @swagger
   * /api/kyc/submit:
   *   post:
   *     summary: Submit or update KYC registration information
   *     tags: [KYC]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - firstName
   *               - lastName
   *             properties:
   *               firstName:
   *                 type: string
   *                 example: "Abdul Malik"
   *               lastName:
   *                 type: string
   *                 example: "Qmardeen"
   *               middleName:
   *                 type: string
   *                 example: "Middle"
   *                 description: Optional middle name
   *               dateOfBirth:
   *                 type: string
   *                 format: date
   *                 example: "1990-01-01"
   *               idType:
   *                 type: string
   *                 enum: [passport, national_id, drivers_license]
   *                 example: "national_id"
   *               idNumber:
   *                 type: string
   *                 example: "1234567890"
   *               idDocumentUrl:
   *                 type: string
   *                 format: uri
   *                 example: "/uploads/documents/id.jpg"
   *               countryId:
   *                 type: integer
   *                 example: 1
   *     responses:
   *       200:
   *         description: KYC information submitted successfully
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
   *                       type: string
   *                     userId:
   *                       type: string
   *                     tier:
   *                       type: integer
   *                       example: 1
   *                     status:
   *                       type: string
   *                       example: "pending"
   *                     firstName:
   *                       type: string
   *                     lastName:
   *                       type: string
   *                     middleName:
   *                       type: string
   *                     dateOfBirth:
   *                       type: string
   *                       format: date-time
   *                     idType:
   *                       type: string
   *                     idNumber:
   *                       type: string
   *                     faceVerificationSuccessful:
   *                       type: boolean
   *                       example: false
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async submitKYC(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.id;
      const {
        firstName,
        lastName,
        middleName,
        dateOfBirth,
        idType,
        idNumber,
        idDocumentUrl,
        countryId,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'First name and last name are required',
        });
      }

      const result = await this.service.submitKYC(userId, {
        firstName,
        lastName,
        middleName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        idType,
        idNumber,
        idDocumentUrl,
        countryId,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to submit KYC',
      });
    }
  }

  /**
   * @swagger
   * /api/kyc/status:
   *   get:
   *     summary: Get user KYC status and information
   *     tags: [KYC]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: KYC status information
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
   *                     hasKYC:
   *                       type: boolean
   *                       example: true
   *                     status:
   *                       type: string
   *                       enum: [not_started, pending, verified, rejected]
   *                       example: "pending"
   *                     tier:
   *                       type: integer
   *                       example: 1
   *                     faceVerificationSuccessful:
   *                       type: boolean
   *                       example: false
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getKYCStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.getKYCStatus(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get KYC status',
      });
    }
  }

  /**
   * @swagger
   * /api/kyc/face-verification:
   *   post:
   *     summary: Submit face verification result
   *     tags: [KYC]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - imageUrl
   *               - isSuccessful
   *             properties:
   *               imageUrl:
   *                 type: string
   *                 format: uri
   *                 example: "/uploads/face-verification/face.jpg"
   *                 description: URL of the face verification image
   *               isSuccessful:
   *                 type: boolean
   *                 example: true
   *                 description: Whether face verification was successful
   *     responses:
   *       200:
   *         description: Face verification submitted successfully
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
   *                       type: string
   *                     faceVerificationSuccessful:
   *                       type: boolean
   *                       example: true
   *                     status:
   *                       type: string
   *                       example: "verified"
   *                     verifiedAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: Validation error or KYC not found
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async submitFaceVerification(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.id;
      const { imageUrl, isSuccessful } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!imageUrl) {
        return res.status(400).json({
          success: false,
          message: 'Face verification image is required',
        });
      }

      const result = await this.service.submitFaceVerification(
        userId,
        imageUrl,
        isSuccessful === true || isSuccessful === 'true'
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to submit face verification',
      });
    }
  }

  /**
   * @swagger
   * /api/kyc/upload-id:
   *   post:
   *     summary: Upload ID document for KYC verification
   *     tags: [KYC]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - documentUrl
   *               - idType
   *               - idNumber
   *             properties:
   *               documentUrl:
   *                 type: string
   *                 format: uri
   *                 example: "/uploads/documents/passport.jpg"
   *                 description: URL of the uploaded ID document
   *               idType:
   *                 type: string
   *                 enum: [passport, national_id, drivers_license]
   *                 example: "passport"
   *               idNumber:
   *                 type: string
   *                 example: "A12345678"
   *     responses:
   *       200:
   *         description: ID document uploaded successfully
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
   *                       type: string
   *                     idType:
   *                       type: string
   *                     idNumber:
   *                       type: string
   *                     idDocumentUrl:
   *                       type: string
   *                     status:
   *                       type: string
   *                       example: "pending"
   *       400:
   *         description: Validation error or KYC not found
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async uploadIDDocument(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.id;
      const { documentUrl, idType, idNumber } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!documentUrl || !idType || !idNumber) {
        return res.status(400).json({
          success: false,
          message: 'Document URL, ID type, and ID number are required',
        });
      }

      const result = await this.service.uploadIDDocument(userId, documentUrl, idType, idNumber);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to upload ID document',
      });
    }
  }

  /**
   * @swagger
   * /api/kyc/admin/approve:
   *   post:
   *     summary: Admin - Approve user KYC
   *     tags: [KYC]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userId
   *             properties:
   *               userId:
   *                 type: integer
   *                 example: 2
   *                 description: User ID whose KYC to approve
   *     responses:
   *       200:
   *         description: KYC approved successfully
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
   *                       type: string
   *                     userId:
   *                       type: string
   *                     status:
   *                       type: string
   *                       example: "verified"
   *                     verifiedAt:
   *                       type: string
   *                       format: date-time
   *                     user:
   *                       type: object
   *                     message:
   *                       type: string
   *       400:
   *         description: KYC not found or already approved
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async approveKYC(req: Request, res: Response) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const result = await this.service.approveKYC(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to approve KYC',
      });
    }
  }

  /**
   * @swagger
   * /api/kyc/admin/reject:
   *   post:
   *     summary: Admin - Reject user KYC
   *     tags: [KYC]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userId
   *             properties:
   *               userId:
   *                 type: integer
   *                 example: 2
   *                 description: User ID whose KYC to reject
   *               reason:
   *                 type: string
   *                 example: "ID document unclear"
   *                 description: Optional reason for rejection
   *     responses:
   *       200:
   *         description: KYC rejected successfully
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
   *                       type: string
   *                     userId:
   *                       type: string
   *                     status:
   *                       type: string
   *                       example: "rejected"
   *                     reason:
   *                       type: string
   *                     message:
   *                       type: string
   *       400:
   *         description: KYC not found or already rejected
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async rejectKYC(req: Request, res: Response) {
    try {
      const { userId, reason } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const result = await this.service.rejectKYC(userId, reason);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to reject KYC',
      });
    }
  }
}

