# 🗄️ Prisma Database Commands Guide

## Quick Reference

All Prisma commands should be run from the `backend/` directory.

## ✅ Correct Commands

### From Project Root:
```bash
# Navigate to backend first
cd backend

# Then run any of these:
npm run prisma:generate    # Generate Prisma Client
npm run prisma:migrate     # Create and apply migrations
npm run prisma:studio      # Open Prisma Studio
npm run prisma:seed        # Run database seed
```

### Or Use Full Path:
```bash
# From project root, specify schema path
npx prisma migrate dev --schema=backend/prisma/schema.prisma
npx prisma generate --schema=backend/prisma/schema.prisma
npx prisma studio --schema=backend/prisma/schema.prisma
```

## 📋 Common Workflows

### 1. After Pulling New Code (Update Database)
```bash
cd backend
npm run prisma:generate    # Generate Prisma Client
npm run prisma:migrate    # Apply any new migrations
```

### 2. Create New Migration (After Schema Changes)
```bash
cd backend
npm run prisma:migrate    # Creates migration and applies it
```

### 3. View Database (Prisma Studio)
```bash
cd backend
npm run prisma:studio     # Opens browser at http://localhost:5555
```

### 4. Reset Database (⚠️ WARNING: Deletes all data)
```bash
cd backend
npx prisma migrate reset  # Resets database and runs seed
```

### 5. Check Migration Status
```bash
cd backend
npx prisma migrate status
```

## 🔄 Complete Workflow After Pulling New Code

```bash
# 1. Navigate to backend
cd backend

# 2. Install dependencies (if needed)
npm install

# 3. Generate Prisma Client
npm run prisma:generate

# 4. Apply migrations
npm run prisma:migrate

# 5. (Optional) Run seed data
npm run prisma:seed
```

## 🛠️ Troubleshooting

### Error: "Could not find Prisma Schema"
**Solution**: Make sure you're in the `backend/` directory or use `--schema` flag:
```bash
npx prisma migrate dev --schema=backend/prisma/schema.prisma
```

### Error: "Migration failed"
**Solution**: Check your database connection in `.env`:
```bash
# Make sure DATABASE_URL is correct
DATABASE_URL=mysql://rhinox:rhinox@localhost:3306/rhinox_pay
```

### Error: "Migration already applied"
**Solution**: This is normal if migrations are up to date. Check status:
```bash
cd backend
npx prisma migrate status
```

## 📝 Available npm Scripts (in backend/package.json)

| Script | Command | Description |
|--------|---------|-------------|
| `prisma:generate` | `prisma generate` | Generate Prisma Client |
| `prisma:migrate` | `prisma migrate dev` | Create & apply migrations |
| `prisma:studio` | `prisma studio` | Open database GUI |
| `prisma:seed` | `prisma db seed` | Run seed script |

## 🎯 Quick Commands Cheat Sheet

```bash
# Always start from backend directory
cd backend

# Update after pulling code
npm run prisma:generate && npm run prisma:migrate

# Create new migration
npm run prisma:migrate

# View database
npm run prisma:studio

# Check what needs to be migrated
npx prisma migrate status
```

