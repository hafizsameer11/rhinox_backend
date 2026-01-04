# 🚀 Quick Start Guide

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up database:**
   ```bash
   # Generate Prisma Client
   npm run prisma:generate
   
   # Run migrations
   npm run prisma:migrate
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## Creating a New Module

1. **Add Prisma models** in `prisma/schema.prisma`:
   ```prisma
   // ============================================
   // MODULE: YOUR_MODULE
   // ============================================
   model YourModel { ... }
   ```

2. **Run migration:**
   ```bash
   npm run prisma:migrate
   ```

3. **Create module files:**
   ```bash
   mkdir -p src/modules/your-module
   # Create: your-module.module.ts, .controller.ts, .service.ts, .repository.ts
   ```

4. **Register module** in `server.ts`:
   ```typescript
   import { YourModule } from './src/modules/index.js';
   
   moduleLoader.register({
     module: new YourModule(),
     middleware: [authMiddleware], // Optional
   });
   ```

## Available Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Create and run migrations
- `npm run prisma:studio` - Open Prisma Studio (DB GUI)

## Module Structure Template

```
src/modules/your-module/
├── your-module.module.ts      # Module definition
├── your-module.controller.ts  # HTTP handlers
├── your-module.service.ts     # Business logic
└── your-module.repository.ts  # Data access
```

See [MODULAR_ARCHITECTURE.md](./MODULAR_ARCHITECTURE.md) for detailed documentation.

