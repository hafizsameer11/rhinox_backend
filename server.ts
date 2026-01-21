import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import { ModuleLoader } from './src/core/utils/module-loader.js';
import { AuthModule, WalletModule, KYCModule, HomeModule, CountryModule, CryptoModule, DepositModule, ExchangeModule, ConversionModule, TransferModule, PaymentSettingsModule, P2PModule, P2POrderModule, P2PChatModule, P2PReviewModule, BankAccountModule, TransactionHistoryModule, BillPaymentModule, SupportChatModule, NotificationModule } from './src/modules/index.js';
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
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle both development (tsx) and production (compiled) paths
// In development: __dirname = backend/src (if running from src) or backend (if compiled)
// In production: __dirname = backend/dist (compiled location)
const uploadsPathDev = path.join(__dirname, '../uploads');
const uploadsPathProd = path.join(__dirname, './uploads');
const uploadsPathRoot = path.join(process.cwd(), 'uploads');

// Try multiple paths to find uploads directory
let uploadsPath = uploadsPathRoot; // Default to project root
if (existsSync(uploadsPathDev)) {
  uploadsPath = uploadsPathDev;
} else if (existsSync(uploadsPathProd)) {
  uploadsPath = uploadsPathProd;
} else if (existsSync(uploadsPathRoot)) {
  uploadsPath = uploadsPathRoot;
}

console.log(`📁 Serving static files from: ${uploadsPath}`);

app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    // Set proper content type for images
    if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  },
}));

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
// Trust proxy to detect HTTPS correctly (if behind reverse proxy)
app.set('trust proxy', true);

// Custom Swagger UI setup with HTTPS support
const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Rhinox Pay API Documentation',
  customCssUrl: undefined, // Use default, but ensure HTTPS
  customJs: undefined, // Use default, but ensure HTTPS
  swaggerOptions: {
    // Ensure all URLs use HTTPS when page is served over HTTPS
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  },
};

// Custom handler to ensure HTTPS for Swagger UI assets
app.use('/api-docs', swaggerUi.serveFiles(swaggerSpec, swaggerUiOptions), (req, res, next) => {
  // Detect if request is HTTPS (check headers if behind proxy)
  const isHttps = req.secure || 
                   req.headers['x-forwarded-proto'] === 'https' ||
                   req.headers['x-forwarded-ssl'] === 'on' ||
                   (req.headers['x-forwarded-proto'] as string)?.includes('https');
  
  // If HTTPS, ensure Swagger UI uses HTTPS for assets
  if (isHttps) {
    // Override Swagger UI HTML to use HTTPS for assets
    const swaggerHtml = swaggerUi.generateHTML(swaggerSpec, swaggerUiOptions);
    // Replace HTTP with HTTPS in asset URLs
    const secureHtml = swaggerHtml.replace(
      /http:\/\/billspro\.hmstech\.xyz\/docs\/asset\//g,
      'https://billspro.hmstech.xyz/docs/asset/'
    ).replace(
      /http:\/\//g,
      'https://'
    );
    return res.send(secureHtml);
  }
  
  // For HTTP, use default behavior
  return swaggerUi.setup(swaggerSpec, swaggerUiOptions)(req, res, next);
});

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
    module: new P2POrderModule(),
    // Public routes (browse ads, get ad details) don't need auth - handled in module
    // Protected routes (create order, manage orders) require auth - handled in module
    // Registered before P2PModule to ensure /ads/browse is matched before /ads/:id
  },
  {
    module: new P2PModule(),
    middleware: [authMiddleware],
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
  {
    module: new TransactionHistoryModule(),
    middleware: [authMiddleware],
  },
  {
    module: new BillPaymentModule(),
    middleware: [authMiddleware],
  },
  {
    module: new SupportChatModule(),
    // All routes require auth - handled in module
  },
  {
    module: new NotificationModule(),
    middleware: [authMiddleware],
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