# Dokploy Deployment Guide

This guide explains how to deploy the backend to Dokploy with proper configuration.

## Prerequisites

- Dokploy instance running
- MySQL database (can be external or managed by Dokploy)
- Domain name configured (optional but recommended)

## Deployment Steps

### 1. Repository Setup

If your repository is inside the backend folder:

```
your-repo/
└── backend/
    ├── Dockerfile
    ├── package.json
    ├── src/
    ├── prisma/
    └── ...
```

**In Dokploy:**
- Set **Build Context** to: `./backend` or `/backend`
- Set **Dockerfile Path** to: `Dockerfile` (or `backend/Dockerfile` if building from root)

### 2. Environment Variables

Add these environment variables in Dokploy:

#### Required Variables

```env
# Database
DATABASE_URL=mysql://username:password@host:port/database_name

# JWT Authentication
JWT_SECRET=your-256-bit-secret-key-change-in-production
JWT_EXPIRES_IN=3600
REFRESH_TOKEN_SECRET=your-refresh-token-secret-change-in-production
REFRESH_TOKEN_EXPIRES_IN=2592000

# Encryption (MUST be exactly 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key!!

# Application
NODE_ENV=production
PORT=3000
BASE_URL=https://yourdomain.com
```

#### Optional Variables

```env
# Email (if using email features)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Tatum (if using external crypto service)
TATUM_API_KEY=your_tatum_api_key
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/crypto/webhook/tatum
```

### 3. Volume Configuration

**Important:** Configure volume for uploads folder in Dokploy:

- **Volume Path:** `/app/uploads`
- **Host Path:** `/path/to/persistent/uploads` (or let Dokploy manage it)
- **Mount Point:** `/app/uploads`

This ensures uploaded files (images, logos, etc.) persist across container restarts.

### 4. Port Configuration

- **Container Port:** `3000`
- **Host Port:** `3000` (or map to any available port)

### 5. Health Check

The Dockerfile includes a health check endpoint:
- **Endpoint:** `/health`
- **Interval:** 30 seconds
- **Timeout:** 3 seconds
- **Retries:** 3

Dokploy will automatically use this for container health monitoring.

### 6. Database Migration

After deployment, run database migrations:

**Option 1: Via Dokploy Terminal**
```bash
# Connect to container terminal in Dokploy
npx prisma migrate deploy
npx prisma db seed  # Optional: seed initial data
```

**Option 2: Via SSH/Remote**
```bash
# If you have SSH access
docker exec -it <container-name> npx prisma migrate deploy
docker exec -it <container-name> npx prisma db seed
```

### 7. Build Settings in Dokploy

**Build Configuration:**
- **Build Context:** `./backend` (or `/backend` if repo root)
- **Dockerfile:** `Dockerfile`
- **Build Args:** None required

**Build Command (if custom):**
```bash
docker build -t rhinox-pay-backend -f Dockerfile .
```

### 8. Post-Deployment Checklist

- [ ] Environment variables set
- [ ] Volume mounted for `/app/uploads`
- [ ] Database migrations run
- [ ] Database seeded (optional)
- [ ] Health check passing
- [ ] API accessible at `/health` endpoint
- [ ] Swagger docs accessible at `/api-docs`
- [ ] Uploads folder writable

### 9. Troubleshooting

#### Issue: Container fails to start

**Check logs:**
```bash
# In Dokploy, view container logs
# Look for:
# - Database connection errors
# - Missing environment variables
# - Port conflicts
```

#### Issue: Uploads not persisting

**Solution:**
- Verify volume is mounted in Dokploy
- Check volume path: `/app/uploads`
- Ensure container has write permissions

#### Issue: Database connection fails

**Solution:**
- Verify `DATABASE_URL` format: `mysql://user:pass@host:port/db`
- Check database is accessible from container
- Verify network connectivity

#### Issue: Prisma Client not found

**Solution:**
```bash
# Run in container
npx prisma generate
```

### 10. Monitoring

**Health Check Endpoint:**
```
GET https://yourdomain.com/health
```

**Expected Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 11. Updates and Redeployment

When updating:

1. Push changes to repository
2. Dokploy will detect changes (if auto-deploy enabled)
3. Build new image
4. Deploy new container
5. Run migrations if schema changed:
   ```bash
   npx prisma migrate deploy
   ```

### 12. Backup Strategy

**Important Files to Backup:**
- Database (regular backups)
- Uploads folder (volume data)
- Environment variables (export from Dokploy)

**Backup Uploads:**
```bash
# Backup uploads volume
docker run --rm -v <volume-name>:/data -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz /data
```

## Dokploy-Specific Configuration

### Build Context

If repository is in backend folder:
- **Build Context:** `./backend`
- **Dockerfile:** `Dockerfile`

If building from root:
- **Build Context:** `.`
- **Dockerfile:** `backend/Dockerfile`

### Volume Mount

In Dokploy volume settings:
- **Container Path:** `/app/uploads`
- **Volume Name:** `rhinox-pay-uploads` (or auto-generated)
- **Type:** Named Volume or Bind Mount

### Network

- Dokploy will create a network automatically
- Ensure database is accessible from this network
- If using external database, configure firewall rules

## Production Best Practices

1. **Use HTTPS:** Configure SSL/TLS in Dokploy
2. **Environment Variables:** Never commit `.env` files
3. **Database Backups:** Set up automated backups
4. **Monitoring:** Enable Dokploy monitoring/alerting
5. **Logs:** Configure log rotation
6. **Updates:** Test in staging before production
7. **Security:** Keep dependencies updated
8. **Secrets:** Use Dokploy secrets management

## Support

For issues:
1. Check Dokploy logs
2. Check container logs
3. Verify environment variables
4. Test database connectivity
5. Verify volume mounts

---

**Last Updated:** 2024  
**Maintained By:** Development Team
