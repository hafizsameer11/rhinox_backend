# 🦏 Rhinox Pay - Complete Backend Documentation

> **A comprehensive fintech wallet platform for fiat and crypto payments**

## 🚀 Quick Start

### Development Setup

**Choose your preferred setup:**

1. **Local Development** (Recommended for Mac)
   - Use local MySQL and Redis
   - Run backend directly
   - 👉 [Local Development Guide](./LOCAL_DEVELOPMENT.md)

2. **Docker Development**
   - Use Docker for all services
   - Production-like environment
   - 👉 [Docker Setup Guide](./DOCKER_SETUP.md)

### Quick Commands

```bash
# Local Development
brew services start mysql@8.0 redis
cd backend && npm install && npm run dev

# Docker Development
docker compose up -d
cd backend && npm install && npm run dev
```

## 📚 Documentation

### Setup Guides
- [Local Development Guide](./LOCAL_DEVELOPMENT.md) - Setup without Docker
- [Docker Setup Guide](./DOCKER_SETUP.md) - Complete Docker guide
- [Setup Commands](./setup.md) - Quick reference

### Architecture
- [Modular Architecture](./backend/MODULAR_ARCHITECTURE.md) - Complete architecture docs
- [Backend README](./backend/README.md) - Backend-specific docs

### Operations
- [Data Persistence](./DATA_PERSISTENCE.md) - Backup strategies
- [Middleware Setup](./backend/MIDDLEWARE_SETUP.md) - Auth & upload middleware

## 🏗️ Project Structure

```
rhinox-pay/
├── backend/              # Node.js/Express backend
│   ├── src/
│   │   ├── modules/     # Feature modules (auth, wallet, etc.)
│   │   └── core/        # Core infrastructure
│   └── prisma/         # Database schema
├── docker-compose.yml   # Docker services (MySQL, Redis, etc.)
├── scripts/            # Backup/restore scripts
└── docs/              # Documentation
```

## 🔄 Switching Between Local and Docker

### To Use Local:
1. Stop Docker: `docker compose down`
2. Start local services: `brew services start mysql@8.0 redis`
3. Update `.env`: `DATABASE_URL=mysql://rhinox:rhinox@localhost:3306/rhinox_pay`

### To Use Docker:
1. Stop local services: `brew services stop mysql@8.0 redis`
2. Start Docker: `docker compose up -d`
3. Update `.env`: `DATABASE_URL=mysql://rhinox:rhinox@localhost:3307/rhinox_pay`

## 🎯 Features

- 💵 Fiat Operations (Deposits, Withdrawals, Transfers)
- 🪙 Crypto Operations (Multi-currency wallets)
- 🤝 P2P Marketplace (Escrow system)
- ⚡ Bill Payments (Utilities, Airtime, Data)
- 🔐 Security (JWT, 2FA, KYC)

## 🛠️ Tech Stack

- **Backend**: Node.js 20, Express.js 5, TypeScript
- **Database**: MySQL 8.0, Prisma ORM
- **Cache**: Redis 7
- **Containerization**: Docker & Docker Compose

## 📝 Environment Variables

See `backend/.env.example` for configuration options.

**Key Variables:**
- `DATABASE_URL` - MySQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `REFRESH_TOKEN_SECRET` - Refresh token secret

## 🚀 Production Deployment

When deploying to server:
1. Use Docker setup (all services containerized)
2. Configure production environment variables
3. Set up automated backups
4. Enable monitoring and logging

See [DOCKER_SETUP.md](./DOCKER_SETUP.md) for production guide.

---

**Happy Coding! 🎉**
