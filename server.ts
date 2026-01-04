import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import { ModuleLoader } from './src/core/utils/module-loader.js';
import { AuthModule, WalletModule, KYCModule, HomeModule, CountryModule, CryptoModule, DepositModule, ExchangeModule, ConversionModule, TransferModule, PaymentSettingsModule, P2PModule, P2POrderModule, P2PChatModule, P2PReviewModule, BankAccountModule } from './src/modules/index.js';
import { authMiddleware } from './src/core/middleware/auth.middleware.js';
import ApiError from './src/core/utils/ApiError.js';
import { swaggerSpec } from './src/core/config/swagger.js';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middleware Setup
// ============================================
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(compression()); // Compress responses
app.use(morgan('dev')); // Logging
app.use(cookieParser()); // Parse cookies
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve static files from uploads directory
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================
// Health Check
// ============================================
/**
 * @swagger
 * /:
 *   get:
 *     summary: API root endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Rhinox Pay API running ✅"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 */
app.get('/', (_, res) => {
  res.json({
    success: true,
    message: 'Rhinox Pay API running ✅',
    version: '1.0.0',
  });
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (_, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// Swagger Documentation
// ============================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Rhinox Pay API Documentation',
}));

// Swagger JSON endpoint
app.get('/api-docs.json', (_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ============================================
// Module Registration
// ============================================
const moduleLoader = new ModuleLoader(app);

// Register modules
moduleLoader.registerMany([
  // Public modules (no auth required)
  {
    module: new AuthModule(),
  },
  {
    module: new CountryModule(),
  },
  
  // Protected modules (require authentication)
  {
    module: new WalletModule(),
    middleware: [authMiddleware],
  },
  {
    module: new KYCModule(),
    middleware: [authMiddleware],
  },
  {
    module: new HomeModule(),
    middleware: [authMiddleware],
  },
  {
    module: new CryptoModule(),
    middleware: [authMiddleware],
  },
  {
    module: new DepositModule(),
    middleware: [authMiddleware],
  },
  {
    module: new ExchangeModule(),
    // Public routes don't need auth
  },
  {
    module: new ConversionModule(),
    middleware: [authMiddleware],
  },
  {
    module: new TransferModule(),
    middleware: [authMiddleware],
  },
  {
    module: new PaymentSettingsModule(),
    middleware: [authMiddleware],
  },
  {
    module: new P2PModule(),
    middleware: [authMiddleware],
  },
  {
    module: new P2POrderModule(),
    // Public routes (browse ads, get ad details) don't need auth - handled in module
    // Protected routes (create order, manage orders) require auth - handled in module
  },
  {
    module: new P2PChatModule(),
    middleware: [authMiddleware],
  },
  {
    module: new P2PReviewModule(),
    // Public routes (view reviews) don't need auth - handled in module
    // Protected routes (create/update/delete review) require auth - handled in module
  },
  {
    module: new BankAccountModule(),
    // Public route - no auth required
  },
]);

// Register exchange admin routes separately (require auth)
const exchangeModule = new ExchangeModule();
app.use('/api/exchange', authMiddleware, exchangeModule.getAdminRouter());

// Register crypto public routes separately (no auth)
const cryptoModule = new CryptoModule();
app.use('/api/crypto', cryptoModule.getPublicRouter());

// Register webhook route separately (no auth)
app.use('/api/crypto/webhooks', cryptoModule.getWebhookRouter());

// ============================================
// Error Handling
// ============================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  // Handle ApiError instances
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }
  
  // Handle other errors
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
  });
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Registered modules: ${moduleLoader.getAllModules().map(m => m.name).join(', ')}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
