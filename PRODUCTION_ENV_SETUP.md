# Production Environment Setup

## Required Environment Variables

The following environment variables **MUST** be set in your production environment:

### Database Configuration

```bash
DATABASE_URL=mysql://username:password@host:port/database_name
```

**Example:**
```bash
DATABASE_URL=mysql://rhinox:your_secure_password@mysql_host:3306/rhinox_pay
```

**Important Notes:**
- The URL **must** start with `mysql://`
- Replace `username`, `password`, `host`, `port`, and `database_name` with your actual values
- If using Docker, the host might be `mysql` (service name) or `localhost` depending on your setup
- If using external database, use the actual hostname/IP address

### Setting Environment Variables

#### Option 1: Docker Compose (Recommended)

Add to your `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      DATABASE_URL: mysql://user:password@mysql:3306/rhinox_pay
      # ... other variables
```

#### Option 2: Docker Run

```bash
docker run -e DATABASE_URL="mysql://user:password@host:3306/database" your-image
```

#### Option 3: System Environment Variables

```bash
export DATABASE_URL="mysql://user:password@host:3306/database"
```

#### Option 4: .env File (for local/production server)

Create `.env` file in `backend/` directory:

```env
DATABASE_URL=mysql://user:password@host:3306/database
```

**Note:** Make sure `.env` is loaded before Prisma commands run.

### Verifying Environment Variable

To check if `DATABASE_URL` is set correctly:

```bash
# Inside container or server
echo $DATABASE_URL

# Should output something like:
# mysql://user:password@host:3306/database
```

### Common Issues

#### Error: "the URL must start with the protocol `mysql://`"

**Cause:** `DATABASE_URL` is either:
- Not set (empty/undefined)
- Set but doesn't start with `mysql://`
- Has extra whitespace

**Solution:**
1. Check if variable is set: `echo $DATABASE_URL`
2. Ensure it starts with `mysql://`
3. Remove any quotes or whitespace if setting manually
4. Restart the container/service after setting

#### Error: "Prisma config detected, skipping environment variable loading"

This is a warning, not an error. Prisma is using `prisma.config.ts` instead of reading from `.env` directly. Make sure `DATABASE_URL` is available as an environment variable when Prisma runs.

### Production Checklist

- [ ] `DATABASE_URL` is set in production environment
- [ ] `DATABASE_URL` starts with `mysql://`
- [ ] Database credentials are correct
- [ ] Database host is accessible from the application
- [ ] Database exists and user has proper permissions
- [ ] Environment variable is loaded before Prisma commands execute

