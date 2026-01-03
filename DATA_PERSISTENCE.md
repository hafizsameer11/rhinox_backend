# 📦 Data Persistence & Backup Strategy

## Overview

This document outlines the data persistence strategy for Rhinox Pay, following industry best practices to ensure data safety and recoverability.

## Current Setup

### Data Storage Strategy

We use **Docker Named Volumes** (industry standard) instead of bind mounts for better:
- ✅ **Portability**: Volumes work across different host systems
- ✅ **Performance**: Better I/O performance on Linux
- ✅ **Security**: Managed by Docker, not directly accessible
- ✅ **Backup**: Easier to backup and restore

### Volumes Configuration

```yaml
volumes:
  mysql_data:      # MySQL database files
  mysql_backups:   # Automated backup storage
  redis_data:      # Redis persistence files
```

## Data Persistence Methods

### 1. **Named Volumes (Current - Recommended)**
- Data stored in Docker-managed volumes
- Survives container removal: `docker compose down`
- Survives container recreation
- **Location**: Managed by Docker (usually `/var/lib/docker/volumes/`)

**Pros:**
- Industry standard
- Better performance
- Easier backup/restore
- Works across platforms

**Cons:**
- Less direct access from host
- Requires Docker commands to access

### 2. **Bind Mounts (Alternative)**
- Data stored directly on host filesystem
- Example: `./mysql-data:/var/lib/mysql`
- **Location**: Project directory

**Pros:**
- Direct file access
- Easy to backup with standard tools

**Cons:**
- Platform-specific paths
- Permission issues
- Less portable

### 3. **External Database (Production)**
- Managed services: AWS RDS, Google Cloud SQL, Azure Database
- **Recommended for production**

**Pros:**
- Automatic backups
- High availability
- Scalability
- Managed maintenance

## Backup Strategy

### Automated Backups

#### Option 1: Using Backup Service (Recommended)
```bash
# Run automated backup
docker compose --profile backup run --rm mysql-backup
```

#### Option 2: Manual Backup Script
```bash
# Run manual backup
./scripts/backup-manual.sh
```

Backups are stored with timestamp: `rhinox_pay_YYYYMMDD_HHMMSS.sql.gz`

### Backup Retention

- **Default**: 7 days
- **Configurable**: Edit `RETENTION_DAYS` in `scripts/backup.sh`
- Old backups are automatically cleaned up

### Restore from Backup

```bash
# Restore from backup
./scripts/restore.sh backups/rhinox_pay_20240101_120000.sql.gz
```

## Data Safety Checklist

### ✅ Current Protections

1. **Named Volumes**: Data persists outside containers
2. **Health Checks**: Services wait for dependencies
3. **Automated Backups**: Daily backup capability
4. **Backup Retention**: Automatic cleanup of old backups
5. **Git Ignore**: Data directories excluded from version control

### 🔒 Production Recommendations

1. **External Database**: Use managed database service
2. **Automated Daily Backups**: Schedule cron job or CI/CD
3. **Off-site Backups**: Store backups in cloud storage (S3, etc.)
4. **Backup Testing**: Regularly test restore procedures
5. **Monitoring**: Alert on backup failures
6. **Point-in-time Recovery**: Enable MySQL binlog for PITR

## Volume Management Commands

### List Volumes
```bash
docker volume ls | grep rhinox
```

### Inspect Volume
```bash
docker volume inspect rhinox_mysql_data
```

### Backup Volume (Full)
```bash
# Stop services
docker compose down

# Backup volume
docker run --rm \
  -v rhinox_mysql_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/mysql_volume_$(date +%Y%m%d).tar.gz -C /data .

# Start services
docker compose up -d
```

### Restore Volume (Full)
```bash
# Stop services
docker compose down

# Restore volume
docker run --rm \
  -v rhinox_mysql_data:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/mysql_volume_YYYYMMDD.tar.gz -C /data"

# Start services
docker compose up -d
```

## Migration from Bind Mounts to Named Volumes

If you're migrating from the old bind mount setup:

```bash
# 1. Stop services
docker compose down

# 2. Create volume and copy data
docker volume create rhinox_mysql_data
docker run --rm \
  -v ./mysql-data:/source \
  -v rhinox_mysql_data:/dest \
  alpine sh -c "cp -a /source/. /dest/"

# 3. Update docker-compose.yml (already done)
# 4. Start services
docker compose up -d

# 5. Verify data
docker exec rhinox_mysql mysql -u rhinox -prhinox -e "USE rhinox_pay; SHOW TABLES;"
```

## Production Deployment

### Recommended Architecture

```
┌─────────────────────────────────────────┐
│         Application Servers             │
│      (Docker/Kubernetes)                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Managed Database Service           │
│  (AWS RDS / Google Cloud SQL / etc.)    │
│  - Automatic Backups                    │
│  - High Availability                    │
│  - Point-in-time Recovery               │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Cloud Storage (S3/GCS)             │
│  - Daily Backups                        │
│  - Cross-region Replication             │
│  - Versioning                           │
└─────────────────────────────────────────┘
```

## Monitoring & Alerts

### Backup Health Checks

Add to your monitoring:
- ✅ Backup job success/failure
- ✅ Backup file size (should be consistent)
- ✅ Disk space for backups
- ✅ Database size growth

### Example Monitoring Script

```bash
#!/bin/bash
# Check if backup exists from last 24 hours
BACKUP_DIR="./backups"
RECENT_BACKUP=$(find "$BACKUP_DIR" -name "rhinox_pay_*.sql.gz" -mtime -1)

if [ -z "$RECENT_BACKUP" ]; then
  echo "⚠️  WARNING: No backup found in last 24 hours!"
  exit 1
fi

echo "✅ Backup found: $RECENT_BACKUP"
```

## FAQ

### Q: Will I lose data if I run `docker compose down`?
**A:** No! Data is stored in named volumes, which persist independently of containers.

### Q: Will I lose data if I delete a container?
**A:** No! Volumes are separate from containers. Only `docker volume rm` will delete data.

### Q: Where is my data stored?
**A:** Docker manages volumes. Use `docker volume inspect rhinox_mysql_data` to find the location.

### Q: How do I backup to cloud storage?
**A:** After creating backup, upload to S3/GCS:
```bash
./scripts/backup-manual.sh
aws s3 cp backups/rhinox_pay_*.sql.gz s3://your-bucket/backups/
```

### Q: Can I use external MySQL instead?
**A:** Yes! Update `DATABASE_URL` in docker-compose.yml to point to external database.

## Summary

✅ **Data is safe**: Named volumes persist independently  
✅ **Backups available**: Automated and manual options  
✅ **Industry standard**: Follows Docker best practices  
✅ **Production ready**: Can migrate to managed services  

Your data will **NOT** be lost when containers are removed or recreated!

