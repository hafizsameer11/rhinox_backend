# 🔐 Middleware Setup Complete

## ✅ What's Been Configured

### 1. Authentication Middleware (`auth.middleware.ts`)

**Location:** `src/core/middleware/auth.middleware.ts`

**Features:**
- ✅ Validates JWT tokens from Authorization header or cookies
- ✅ Verifies token using `verifyToken` utility
- ✅ Fetches user from database using Prisma
- ✅ Attaches user to `req.body._user` and `req.user`
- ✅ Uses `ApiError` for consistent error handling
- ✅ Follows your exact format and structure

**Usage:**
```typescript
import authenticateUser from './core/middleware/auth.middleware.js';

// Apply to module
moduleLoader.register({
  module: new YourModule(),
  middleware: [authenticateUser],
});

// Or in individual routes
router.get('/protected', authenticateUser, handler);
```

### 2. File Upload Middleware (`upload.middleware.ts`)

**Location:** `src/core/middleware/upload.middleware.ts`

**Features:**
- ✅ Multer configuration for file uploads
- ✅ Docker-compatible (uses `/app/uploads` in production)
- ✅ Unique filename generation
- ✅ 100MB file size limit
- ✅ Supports single, multiple, and field-based uploads
- ✅ Volume mounted in Docker for persistence

**Usage:**
```typescript
import upload, { uploadSingle, uploadMultiple, uploadFields } from './core/middleware/upload.middleware.js';

// Single file
router.post('/upload', uploadSingle('file'), handler);

// Multiple files
router.post('/upload', uploadMultiple('files', 5), handler);

// Multiple fields
router.post('/upload', uploadFields([
  { name: 'avatar', maxCount: 1 },
  { name: 'documents', maxCount: 5 },
]), handler);
```

### 3. ApiError Utility (`ApiError.ts`)

**Location:** `src/core/utils/ApiError.ts`

**Features:**
- ✅ Custom error class with status codes
- ✅ Factory methods for common errors
- ✅ Integrated with Express error handler

**Usage:**
```typescript
import ApiError from './core/utils/ApiError.js';

throw ApiError.unauthorized('You are not logged in');
throw ApiError.badRequest('Invalid input');
throw ApiError.notFound('Resource not found');
```

### 4. Auth Utilities (`authUtils.ts`)

**Location:** `src/core/utils/authUtils.ts`

**Features:**
- ✅ `verifyToken()` - Verifies JWT tokens
- ✅ `generateAccessToken()` - Creates access tokens
- ✅ `generateRefreshToken()` - Creates refresh tokens
- ✅ Supports both JWT_SECRET and REFRESH_TOKEN_SECRET

### 5. Database Configuration

**Updated:** `src/core/config/database.ts`

- ✅ Exports both default and named export for Prisma
- ✅ Compatible with middleware imports

## 🐳 Docker Configuration

### Uploads Volume

Added to `docker-compose.yml`:
```yaml
volumes:
  - ./backend/uploads:/app/uploads  # File uploads directory
```

This ensures:
- ✅ Uploaded files persist across container restarts
- ✅ Files accessible from host machine
- ✅ Works in both development and production

### Directory Structure

```
backend/
├── uploads/          # Created automatically
│   └── (uploaded files)
└── src/
    └── core/
        ├── middleware/
        │   ├── auth.middleware.ts
        │   └── upload.middleware.ts
        └── utils/
            ├── ApiError.ts
            └── authUtils.ts
```

## 📦 Installed Packages

- `cookie-parser` - Cookie parsing middleware
- `multer` - File upload handling
- `@types/cookie-parser` - TypeScript types
- `@types/multer` - TypeScript types

## 🔧 Server Updates

**Updated:** `server.ts`

- ✅ Added `cookie-parser` middleware
- ✅ Updated error handler to work with `ApiError`
- ✅ Imports `ApiError` for error handling

## 📝 Example Usage

### Protected Route with File Upload

```typescript
import { Router } from 'express';
import authenticateUser from '../../core/middleware/auth.middleware.js';
import { uploadSingle } from '../../core/middleware/upload.middleware.js';
import ApiError from '../../core/utils/ApiError.js';

const router = Router();

router.post(
  '/upload-avatar',
  authenticateUser,        // Require authentication
  uploadSingle('avatar'),  // Handle file upload
  async (req, res, next) => {
    try {
      const user = req.body._user; // User from auth middleware
      const file = req.file;       // File from multer
      
      if (!file) {
        throw ApiError.badRequest('No file uploaded');
      }
      
      // Process file...
      res.json({
        success: true,
        message: 'File uploaded',
        file: {
          filename: file.filename,
          path: file.path,
          size: file.size,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
```

## ✅ Everything is Ready!

All middleware is configured and ready to use:
- ✅ Auth middleware follows your exact format
- ✅ Multer configured for Docker
- ✅ Error handling with ApiError
- ✅ Utilities for JWT operations
- ✅ Docker volumes for file persistence
- ✅ TypeScript types included
- ✅ No linting errors

## 📚 Documentation

- `src/core/middleware/README.md` - Middleware usage guide
- `src/core/utils/README.md` - Utility functions guide

---

**Ready to use!** 🚀

