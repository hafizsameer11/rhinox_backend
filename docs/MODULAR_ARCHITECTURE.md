# 🏗️ Modular Architecture Guide

## Overview

This project follows a **modular architecture** where each feature is organized as a self-contained module. Each module contains its own routes, controllers, services, and Prisma models.

## 📁 Project Structure

```
backend/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── auth/            # Authentication module
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.service.ts
│   │   ├── wallet/          # Wallet module
│   │   │   ├── wallet.module.ts
│   │   │   ├── wallet.controller.ts
│   │   │   └── wallet.service.ts
│   │   └── index.ts         # Module exports
│   │
│   ├── core/                # Core infrastructure
│   │   ├── config/          # Configuration (database, etc.)
│   │   ├── middleware/      # Express middlewares
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Utilities (module loader, etc.)
│   │
│   └── shared/              # Shared utilities across modules
│
├── prisma/
│   └── schema.prisma        # Database schema (organized by modules)
│
└── server.ts                # Application entry point
```

## 🧩 Module Structure

Each module follows this structure:

```
modules/
└── [module-name]/
    ├── [module-name].module.ts      # Module definition & route setup
    ├── [module-name].controller.ts  # HTTP request handlers
    └── [module-name].service.ts     # Business logic & data access (Prisma)
```

### Module Components

#### 1. **Module File** (`*.module.ts`)
- Defines the module interface
- Sets up routes
- Initializes dependencies (controller, service)
- Implements `IModule` interface

```typescript
export class AuthModule implements IModule {
  public readonly name = 'auth';
  public readonly path = '/api/auth';
  public readonly router: Router;
  
  constructor() {
    // Initialize dependencies
    this.service = new AuthService();
    this.controller = new AuthController(this.service);
    
    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }
}
```

#### 2. **Controller** (`*.controller.ts`)
- Handles HTTP requests/responses
- Validates input
- Calls service methods
- Returns formatted responses

```typescript
export class AuthController {
  constructor(private service: AuthService) {}
  
  async register(req: Request, res: Response) {
    // Handle registration request
  }
}
```

#### 3. **Service** (`*.service.ts`)
- Contains business logic
- Handles database queries directly with Prisma
- Handles transactions
- Validates business rules

```typescript
import prisma from '../../core/config/database.js';

export class AuthService {
  async register(data: RegisterData) {
    // Business logic and database queries
    const user = await prisma.user.create({ data });
    return user;
  }
}
```

## 🗄️ Prisma Organization

Prisma schema is organized **modularly** with clear sections for each module:

```prisma
// ============================================
// MODULE: AUTH
// ============================================
model User { ... }
model Session { ... }
model RefreshToken { ... }
model KYC { ... }

// ============================================
// MODULE: WALLET
// ============================================
model Wallet { ... }

// ============================================
// MODULE: TRANSACTION
// ============================================
model Transaction { ... }
```

### Benefits of Modular Prisma Schema

✅ **Clear organization** - Easy to find models by feature  
✅ **Better collaboration** - Teams can work on different modules  
✅ **Maintainability** - Changes are localized to module sections  
✅ **Documentation** - Comments clearly separate modules  

## 🚀 Creating a New Module

### Step 1: Add Prisma Models

Edit `prisma/schema.prisma` and add models in a new module section:

```prisma
// ============================================
// MODULE: TRANSACTION
// ============================================
model Transaction {
  id        String   @id @default(uuid())
  // ... fields
}
```

Run migration:
```bash
npx prisma migrate dev --name add_transaction_module
```

### Step 2: Create Module Files

```bash
mkdir -p src/modules/transaction
touch src/modules/transaction/transaction.{module,controller,service,repository}.ts
```

### Step 3: Implement Module

**transaction.service.ts:**
```typescript
import prisma from '../../core/config/database.js';

export class TransactionService {
  async createTransaction(data: CreateTransactionData) {
    // Business logic and database queries
    return prisma.transaction.create({ data });
  }
}
```

**transaction.controller.ts:**
```typescript
import { TransactionService } from './transaction.service.js';

export class TransactionController {
  constructor(private service: TransactionService) {}
  
  async create(req: Request, res: Response) {
    const result = await this.service.createTransaction(req.body);
    res.json({ success: true, data: result });
  }
}
```

**transaction.module.ts:**
```typescript
import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { TransactionController } from './transaction.controller.js';
import { TransactionService } from './transaction.service.js';

export class TransactionModule implements IModule {
  public readonly name = 'transaction';
  public readonly path = '/api/transactions';
  public readonly router: Router;

  private controller: TransactionController;
  private service: TransactionService;

  constructor() {
    this.service = new TransactionService();
    this.controller = new TransactionController(this.service);

    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post('/', this.controller.create.bind(this.controller));
    this.router.get('/', this.controller.list.bind(this.controller));
  }
}
```

### Step 4: Register Module

**src/modules/index.ts:**
```typescript
export { TransactionModule } from './transaction/transaction.module.js';
```

**server.ts:**
```typescript
import { TransactionModule } from './src/modules/index.js';

moduleLoader.register({
  module: new TransactionModule(),
  middleware: [authMiddleware], // If protected
});
```

## 🔐 Module Middleware

Modules can have their own middleware:

```typescript
moduleLoader.register({
  module: new WalletModule(),
  middleware: [authMiddleware, rateLimitMiddleware],
});
```

## 📊 Module Dependencies

Modules can depend on each other through services:

```typescript
// In transaction.service.ts
import { WalletService } from '../wallet/wallet.service.js';

export class TransactionService {
  constructor(
    private repository: TransactionRepository,
    private walletService: WalletService // Use another module's service
  ) {}
}
```

## ✅ Best Practices

### 1. **Single Responsibility**
Each module should handle one feature domain.

### 2. **Direct Prisma Access**
Services use Prisma directly for database operations:
```typescript
import prisma from '../../core/config/database.js';

export class AuthService {
  async createUser(data: CreateUserData) {
    return prisma.user.create({ data });
  }
}
```

### 3. **Error Handling**
Handle errors at controller level, throw from service.

### 4. **Type Safety**
Use TypeScript types for all data structures.

### 5. **Prisma Models**
Group related models together in schema with clear module comments.

## 🎯 Module Examples

### Current Modules

1. **Auth Module** (`/api/auth`)
   - Registration, login, logout
   - Email verification
   - Session management

2. **Wallet Module** (`/api/wallets`)
   - Wallet creation
   - Balance management
   - Transaction history

### Future Modules

- **Transaction Module** - Payment processing
- **P2P Module** - Peer-to-peer trading
- **Bill Payment Module** - Utility bill payments
- **Crypto Module** - Cryptocurrency operations
- **KYC Module** - Identity verification

## 🔄 Module Lifecycle

1. **Registration** - Module is registered in `server.ts`
2. **Initialization** - Module constructor runs, dependencies created
3. **Route Setup** - Routes are registered with Express
4. **Request Handling** - Requests flow: Route → Controller → Service → Database (Prisma)

## 📝 Module Interface

All modules must implement `IModule`:

```typescript
interface IModule {
  name: string;      // Module identifier
  path: string;     // Base route path
  router: Router;   // Express router
}
```

## 🚦 Getting Started

1. **Run Prisma migrations:**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

2. **Start the server:**
   ```bash
   npm run dev
   ```

3. **Test modules:**
   - Auth: `POST /api/auth/register`
   - Wallet: `GET /api/wallets` (requires auth)

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

**Happy Modular Coding! 🎉**

