# 🦏 Rhinox Pay - Backend API

Modular Node.js/Express backend built with TypeScript and Prisma.

## 🏗️ Architecture

This project follows a **modular architecture** where each feature is a self-contained module.

### Module Structure

Each module contains:
- **Routes** - API endpoints
- **Controllers** - HTTP request handlers
- **Services** - Business logic and data access (Prisma)

### Prisma Organization

Prisma schema is organized by modules with clear section comments:
- Auth Module: User, Session, RefreshToken, KYC
- Wallet Module: Wallet
- Transaction Module: Transaction

## 📁 Project Structure

```
backend/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── auth/            # Authentication
│   │   ├── wallet/          # Wallet management
│   │   └── index.ts         # Module exports
│   │
│   ├── core/                # Core infrastructure
│   │   ├── config/          # Database config
│   │   ├── middleware/      # Express middlewares
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Utilities
│   │
│   └── shared/              # Shared code
│
├── prisma/
│   └── schema.prisma        # Database schema
│
└── server.ts                # Application entry
```

## 🚀 Getting Started

### Choose Your Setup

**Option 1: Local Development (Recommended for Mac)**
- Use local MySQL and Redis
- Run backend directly
- Faster development experience
- 👉 See [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md)

**Option 2: Docker Development**
- Use Docker for all services
- Consistent environment
- Production-like setup
- 👉 See [DOCKER_SETUP.md](../DOCKER_SETUP.md)

### Quick Start (Local)

1. **Install MySQL and Redis:**
   ```bash
   brew install mysql@8.0 redis
   brew services start mysql@8.0 redis
   ```

2. **Setup database:**
   ```bash
   mysql -u root -p
   CREATE DATABASE rhinox_pay;
   CREATE USER 'rhinox'@'localhost' IDENTIFIED BY 'rhinox';
   GRANT ALL PRIVILEGES ON rhinox_pay.* TO 'rhinox'@'localhost';
   FLUSH PRIVILEGES;
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Setup Prisma:**
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

6. **Start server:**
   ```bash
   npm run dev
   ```

Server will run on `http://localhost:3000`

## 📝 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

## 🧩 Current Modules

### Auth Module (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Wallet Module (`/api/wallets`)
- `GET /api/wallets` - Get user wallets
- `GET /api/wallets/:currency` - Get wallet by currency
- `POST /api/wallets/create` - Create new wallet
- `GET /api/wallets/:walletId/balance` - Get wallet balance
- `GET /api/wallets/:walletId/transactions` - Get transactions

## 📚 Documentation

- [Modular Architecture Guide](./MODULAR_ARCHITECTURE.md) - Complete architecture documentation
- [Quick Start Guide](./QUICK_START.md) - Quick reference for common tasks

## 🔧 Environment Variables

Create a `.env` file with:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://rhinox:rhinox@mysql:3306/rhinox_pay
REDIS_URL=redis://redis:6379
JWT_SECRET=your-secret-key
REFRESH_TOKEN_SECRET=your-refresh-secret
```

## 🎯 Creating a New Module

See [MODULAR_ARCHITECTURE.md](./MODULAR_ARCHITECTURE.md) for detailed instructions.

Quick steps:
1. Add Prisma models in `prisma/schema.prisma`
2. Run `npm run prisma:migrate`
3. Create module files (module, controller, service)
4. Register module in `server.ts`

## 🛠️ Tech Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 5
- **Language:** TypeScript
- **ORM:** Prisma
- **Database:** MySQL 8.0
- **Cache:** Redis 7

## 📄 License

ISC

