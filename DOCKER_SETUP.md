# 🐳 Docker Setup Guide

This guide shows how to use Docker for development and production.

## 📋 Prerequisites

- Docker Desktop installed and running
- Docker Compose installed

## 🚀 Quick Start

### 1. Start All Services

```bash
docker compose up -d
```

This starts:
- MySQL 8.0 (port 3307)
- Redis 7 (port 6379)
- phpMyAdmin (port 8080)
- Backend API (port 3000)

### 2. Setup Environment

Create `.env` file in `backend/` directory:

```env
# Application
NODE_ENV=development
PORT=3000

# Database (Docker MySQL)
DATABASE_URL=mysql://rhinox:rhinox@localhost:3307/rhinox_pay

# Redis (Docker)
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_SECRET=your-256-bit-secret-key-change-in-production
JWT_EXPIRES_IN=3600
REFRESH_TOKEN_SECRET=your-refresh-token-secret-change-in-production
REFRESH_TOKEN_EXPIRES_IN=2592000

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key
```

### 3. Run Prisma Migrations

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
```

### 4. Access Services

- **Backend API**: http://localhost:3000
- **phpMyAdmin**: http://localhost:8080
  - Server: `mysql`
  - Username: `root`
  - Password: `root`

## 📝 Common Commands

| Task | Command |
|------|---------|
| Start all services | `docker compose up -d` |
| Stop all services | `docker compose down` |
| View logs | `docker compose logs -f backend` |
| Rebuild backend | `docker compose up -d --build backend` |
| Shell into backend | `docker exec -it rhinox_backend sh` |
| Shell into MySQL | `docker exec -it rhinox_mysql mysql -u root -p` |
| Shell into Redis | `docker exec -it rhinox_redis redis-cli` |
| Backup database | `./scripts/backup-manual.sh` |
| Restore database | `./scripts/restore.sh <backup-file>` |
| Remove all (keep data) | `docker compose down` |
| Remove all (delete data) | `docker compose down -v` |

## 🔄 Development Workflow

### Option 1: Backend in Docker (Recommended for consistency)

1. Start services:
   ```bash
   docker compose up -d
   ```

2. Backend runs automatically in container
3. Access at http://localhost:3000

### Option 2: Backend Locally (Faster development)

1. Start only MySQL and Redis:
   ```bash
   docker compose up -d mysql redis
   ```

2. Run backend locally:
   ```bash
   cd backend
   npm run dev
   ```

3. Update `.env`:
   ```env
   DATABASE_URL=mysql://rhinox:rhinox@localhost:3307/rhinox_pay
   REDIS_URL=redis://localhost:6379
   ```

## 🗄️ Database Management

### Access Database

**Via phpMyAdmin:**
- URL: http://localhost:8080
- Server: `mysql`
- User: `root`
- Password: `root`

**Via MySQL CLI:**
```bash
docker exec -it rhinox_mysql mysql -u rhinox -prhinox rhinox_pay
```

**Via Prisma Studio:**
```bash
cd backend
npm run prisma:studio
```

### Backup Database

```bash
# Manual backup
./scripts/backup-manual.sh

# Automated backup (via Docker service)
docker compose --profile backup run --rm mysql-backup
```

### Restore Database

```bash
./scripts/restore.sh backups/rhinox_pay_20240101_120000.sql.gz
```

## 🔧 Configuration

### Ports

- **MySQL**: 3307 (host) → 3306 (container)
- **Redis**: 6379 (both)
- **Backend**: 3000 (both)
- **phpMyAdmin**: 8080 (host) → 80 (container)

### Volumes

- **MySQL Data**: `mysql_data` (persistent)
- **Redis Data**: `redis_data` (persistent)
- **Backend Code**: `./backend` (mounted for hot reload)
- **Uploads**: `./backend/uploads` (mounted)

### Environment Variables

All environment variables are set in `docker-compose.yml` and can be overridden via `.env` file.

## 🐛 Troubleshooting

### Services Won't Start

```bash
# Check Docker is running
docker ps

# Check logs
docker compose logs

# Restart services
docker compose restart
```

### Port Already in Use

If ports are already in use:
1. Stop conflicting services
2. Or change ports in `docker-compose.yml`

### Database Connection Issues

```bash
# Check MySQL is healthy
docker compose ps mysql

# Check logs
docker compose logs mysql

# Restart MySQL
docker compose restart mysql
```

### Reset Everything

```bash
# Stop and remove all containers and volumes
docker compose down -v

# Start fresh
docker compose up -d
```

## 🚀 Production Deployment

For production:
1. Update environment variables
2. Use production Docker images
3. Set up proper volumes for data persistence
4. Configure backups
5. Set up monitoring

See `DATA_PERSISTENCE.md` for backup strategies.

