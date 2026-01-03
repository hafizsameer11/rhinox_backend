# 🖥️ Local Development Setup (Without Docker)

This guide shows how to run the project using local MySQL and Redis on your Mac, without Docker.

## 📋 Prerequisites

- Node.js 20+
- MySQL 8.0 (installed locally)
- Redis (installed locally)
- Git

## 🔧 Installation

### 1. Install MySQL

**Using Homebrew:**
```bash
brew install mysql@8.0
brew services start mysql@8.0
```

**Verify installation:**
```bash
mysql --version
```

### 2. Install Redis

**Using Homebrew:**
```bash
brew install redis
brew services start redis
```

**Verify installation:**
```bash
redis-cli ping
# Should return: PONG
```

### 3. Setup MySQL Database

```bash
# Connect to MySQL
mysql -u root -p

# Create database and user
CREATE DATABASE rhinox_pay;
CREATE USER 'rhinox'@'localhost' IDENTIFIED BY 'rhinox';
GRANT ALL PRIVILEGES ON rhinox_pay.* TO 'rhinox'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Setup Backend

```bash
cd backend
npm install
```

### 5. Configure Environment Variables

Create `.env` file in `backend/` directory:

```env
# Application
NODE_ENV=development
PORT=3000

# Database (Local MySQL)
DATABASE_URL=mysql://rhinox:rhinox@localhost:3306/rhinox_pay

# Redis (Local)
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_SECRET=your-256-bit-secret-key-change-in-production
JWT_EXPIRES_IN=3600
REFRESH_TOKEN_SECRET=your-refresh-token-secret-change-in-production
REFRESH_TOKEN_EXPIRES_IN=2592000

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key
```

### 6. Run Prisma Migrations

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
```

### 7. Start Development Server

```bash
npm run dev
```

Server will run on `http://localhost:3000`

## 🎯 Quick Commands

| Task | Command |
|------|---------|
| Start MySQL | `brew services start mysql@8.0` |
| Stop MySQL | `brew services stop mysql@8.0` |
| Start Redis | `brew services start redis` |
| Stop Redis | `brew services stop redis` |
| Connect to MySQL | `mysql -u rhinox -p rhinox_pay` |
| Connect to Redis | `redis-cli` |
| Run migrations | `npm run prisma:migrate` |
| Generate Prisma Client | `npm run prisma:generate` |
| Open Prisma Studio | `npm run prisma:studio` |

## 🔄 Switching Between Docker and Local

### To Use Docker:
1. Stop local MySQL and Redis:
   ```bash
   brew services stop mysql@8.0
   brew services stop redis
   ```

2. Update `.env` in `backend/`:
   ```env
   DATABASE_URL=mysql://rhinox:rhinox@localhost:3307/rhinox_pay
   REDIS_URL=redis://localhost:6379
   ```

3. Start Docker services:
   ```bash
   docker compose up -d
   ```

### To Use Local:
1. Stop Docker services:
   ```bash
   docker compose down
   ```

2. Start local MySQL and Redis:
   ```bash
   brew services start mysql@8.0
   brew services start redis
   ```

3. Update `.env` in `backend/`:
   ```env
   DATABASE_URL=mysql://rhinox:rhinox@localhost:3306/rhinox_pay
   REDIS_URL=redis://localhost:6379
   ```

## 🐛 Troubleshooting

### MySQL Connection Issues

**Check if MySQL is running:**
```bash
brew services list | grep mysql
```

**Reset MySQL password:**
```bash
mysql -u root -p
ALTER USER 'rhinox'@'localhost' IDENTIFIED BY 'rhinox';
FLUSH PRIVILEGES;
```

### Redis Connection Issues

**Check if Redis is running:**
```bash
redis-cli ping
```

**Restart Redis:**
```bash
brew services restart redis
```

### Port Conflicts

If port 3306 or 6379 is already in use:
- **MySQL**: Change port in MySQL config or use Docker (port 3307)
- **Redis**: Change port in Redis config or use Docker

## 📝 Notes

- **Docker setup is preserved** - All Docker files remain intact
- **Easy switching** - Just change `.env` and start/stop services
- **Production ready** - When deploying, use Docker setup
- **Data separation** - Docker and local use different databases

## 🚀 Production Deployment

When moving to server, use Docker setup:
- All services containerized
- Data persistence with volumes
- Easy scaling and management
- See `DOCKER_SETUP.md` for production guide

