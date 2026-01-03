# 🚀 Setup Guide

## Choose Your Development Setup

### Option 1: Local Development (Recommended for Mac)
**Use local MySQL and Redis, run backend directly**

👉 See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for complete guide

**Quick Start:**
```bash
# Install MySQL and Redis
brew install mysql@8.0 redis
brew services start mysql@8.0 redis

# Setup database
mysql -u root -p
CREATE DATABASE rhinox_pay;
CREATE USER 'rhinox'@'localhost' IDENTIFIED BY 'rhinox';
GRANT ALL PRIVILEGES ON rhinox_pay.* TO 'rhinox'@'localhost';
FLUSH PRIVILEGES;

# Setup backend
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

### Option 2: Docker Development
**Use Docker for all services**

👉 See [DOCKER_SETUP.md](./DOCKER_SETUP.md) for complete guide

**Quick Start:**
```bash
docker compose up -d
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
```

---

## 📝 Docker Commands (When Using Docker)

| Task                          | Command                                |
| ----------------------------- | -------------------------------------- |
| Start all                     | `docker compose up -d`                 |
| Stop all                      | `docker compose down`                  |
| Start only MySQL & Redis      | `docker compose up -d mysql redis`    |
| Rebuild backend               | `docker compose up -d --build backend` |
| View logs                     | `docker compose logs -f backend`       |
| Shell into container          | `docker exec -it rhinox_backend sh`    |
| **Backup database**           | `./scripts/backup-manual.sh`           |
| **Automated backup**          | `docker compose --profile backup run --rm mysql-backup` |
| **Restore database**          | `./scripts/restore.sh <backup-file>`   |
| Remove containers (keep data) | `docker compose down`                  |
| Remove everything (inc. data) | `docker compose down -v`               |
| List volumes                  | `docker volume ls \| grep rhinox`      |

---

## 🔄 Switching Between Local and Docker

### From Local to Docker:
1. Stop local services: `brew services stop mysql@8.0 redis`
2. Update `.env`: Change `DATABASE_URL` to use port `3307`
3. Start Docker: `docker compose up -d`

### From Docker to Local:
1. Stop Docker: `docker compose down`
2. Start local services: `brew services start mysql@8.0 redis`
3. Update `.env`: Change `DATABASE_URL` to use port `3306`

---

## 📚 Documentation

- [Local Development Guide](./LOCAL_DEVELOPMENT.md) - Setup without Docker
- [Docker Setup Guide](./DOCKER_SETUP.md) - Complete Docker guide
- [Data Persistence](./DATA_PERSISTENCE.md) - Backup strategies
