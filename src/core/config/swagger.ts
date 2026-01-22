import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine if we're running from dist/ (production) or src/ (development)
const isProduction = process.env.NODE_ENV === 'production';
const isCompiled = __dirname.includes('dist');

// Build API paths based on environment
const apiPaths: string[] = [];

if (isCompiled || isProduction) {
  // Running from compiled code (dist/)
  const distPath = path.resolve(__dirname, '../..');
  apiPaths.push(
    path.join(distPath, 'src/modules/**/*.controller.js'),
    path.join(distPath, 'server.js')
  );
} else {
  // Running from source code (development)
  apiPaths.push(
    path.resolve(__dirname, '../../src/modules/**/*.controller.ts'),
    path.resolve(__dirname, '../../server.ts')
  );
}

// Add fallback paths
apiPaths.push(
  './dist/src/modules/**/*.controller.js',
  './dist/server.js',
  './src/modules/**/*.controller.ts',
  './server.ts',
  './src/modules/**/*.controller.js',
  './server.js'
);

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Rhinox Pay API',
      version: '1.0.0',
      description: 'Complete API documentation for Rhinox Pay - A fintech wallet platform for fiat and crypto payments',
      contact: {
        name: 'Rhinox Pay Support',
        email: 'support@rhinoxpay.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://rhinoxpay.hmstech.xyz',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT token stored in cookie',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            email: { type: 'string', example: 'user@example.com' },
            phone: { type: 'string', example: '+1234567890' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            isEmailVerified: { type: 'boolean', example: false },
            isPhoneVerified: { type: 'boolean', example: false },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            currency: { type: 'string', example: 'NGN' },
            currencyName: { type: 'string', example: 'Nigerian Naira' },
            type: { type: 'string', example: 'fiat' },
            balance: { type: 'string', example: '1000.00' },
            lockedBalance: { type: 'string', example: '0.00' },
            availableBalance: { type: 'string', example: '1000.00' },
            flag: { type: 'string', example: '/uploads/flags/ng.png' },
          },
        },
        VirtualAccount: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            accountId: { type: 'string', example: 'account-id' },
            blockchain: { type: 'string', example: 'ethereum' },
            currency: { type: 'string', example: 'USDT' },
            accountBalance: { type: 'string', example: '100.00' },
            availableBalance: { type: 'string', example: '100.00' },
            active: { type: 'boolean', example: true },
            frozen: { type: 'boolean', example: false },
            depositAddresses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  address: { type: 'string', example: '0x...' },
                  currency: { type: 'string', example: 'USDT' },
                  blockchain: { type: 'string', example: 'ethereum' },
                },
              },
            },
          },
        },
        DepositAddress: {
          type: 'object',
          properties: {
            address: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' },
            currency: { type: 'string', example: 'USDT' },
            blockchain: { type: 'string', example: 'ethereum' },
            virtualAccountId: { type: 'integer', example: 1 },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication and user management' },
      { name: 'Wallet', description: 'Wallet management and operations' },
      { name: 'KYC', description: 'KYC registration and verification' },
      { name: 'Home', description: 'User home/dashboard data' },
      { name: 'Country', description: 'Country information and data' },
      { name: 'Crypto', description: 'Cryptocurrency operations and virtual accounts' },
      { name: 'Deposit', description: 'Fiat wallet deposits via bank transfer' },
      { name: 'Exchange', description: 'Currency exchange rates and conversion' },
      { name: 'Conversion', description: 'Currency conversion between fiat wallets' },
      { name: 'Transfer', description: 'Fiat transfers (RhionX user, bank account, mobile money)' },
      { name: 'Payment Settings', description: 'User payment method management (bank accounts, mobile money)' },
      { name: 'P2P - VENDOR (Ad Management)', description: 'VENDOR ONLY: Create, edit, and manage your P2P ads. Routes: /api/p2p/ads/*' },
      { name: 'P2P - VENDOR (Ad Creation)', description: 'VENDOR ONLY: Create new P2P buy and sell ads' },
      { name: 'P2P - VENDOR (Order Management)', description: 'VENDOR ONLY: Manage orders received for your ads. Accept, decline, mark payment received. Routes: /api/p2p/vendor/orders/*' },
      { name: 'P2P - USER (Browse & Order)', description: 'USER: Browse ads to buy/sell, create orders, manage your orders. Routes: /api/p2p/user/*' },
      { name: 'P2P - PUBLIC', description: 'PUBLIC: Browse P2P ads without authentication. Routes: /api/p2p/ads/browse, /api/p2p/ads/:id' },
      { name: 'P2P Chat', description: 'Chat messages between buyer and vendor for orders' },
      { name: 'P2P Review', description: 'Reviews left by users after order completion' },
      { name: 'Bank Accounts', description: 'Public bank account information for deposits' },
      { name: 'Transaction History', description: 'Transaction history with chart data and filtering' },
      { name: 'Bill Payment', description: 'Bill payments (airtime, data, electricity, cable TV, betting, internet)' },
      { name: 'Support Chat', description: 'Support chat conversations between users and support agents' },
      { name: 'Notifications', description: 'User notifications for transactions, P2P, conversions, etc.' },
      { name: 'Health', description: 'Health check endpoints' },
    ],
  },
  apis: apiPaths,
};

// Log Swagger configuration for debugging
console.log('[Swagger] Configuration:', {
  isProduction,
  isCompiled,
  __dirname,
  apiPaths: apiPaths.slice(0, 3), // Log first 3 paths
  totalPaths: apiPaths.length,
});

export const swaggerSpec = swaggerJsdoc(options);

// Log Swagger spec generation result
console.log('[Swagger] Spec generated:', {
  pathsCount: Object.keys((swaggerSpec as any).paths || {}).length,
  tagsCount: (swaggerSpec as any).tags?.length || 0,
});
