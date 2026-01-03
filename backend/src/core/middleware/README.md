# Middleware Documentation

## Authentication Middleware

### Usage

The `authenticateUser` middleware validates JWT tokens from either:
- Authorization header: `Bearer <token>`
- Cookie: `token=<token>`

After validation, it attaches the user object to `req.body._user` and `req.user`.

```typescript
import authenticateUser from './auth.middleware.js';

// In your route
router.get('/protected', authenticateUser, (req, res) => {
  const user = req.body._user; // Full user object from database
  const userId = req.user.id;   // User ID
  res.json({ user });
});
```

### Module Registration

```typescript
moduleLoader.register({
  module: new YourModule(),
  middleware: [authenticateUser], // Apply to all routes in module
});
```

### Error Handling

The middleware uses `ApiError` for consistent error responses:
- `401 Unauthorized` - No token or invalid token
- `500 Internal Server Error` - Database errors

## File Upload Middleware (Multer)

### Usage

#### Single File Upload

```typescript
import upload, { uploadSingle } from './upload.middleware.js';

// In your route
router.post('/upload', uploadSingle('file'), (req, res) => {
  const file = req.file;
  res.json({
    filename: file.filename,
    path: file.path,
    size: file.size,
  });
});
```

#### Multiple Files Upload

```typescript
import { uploadMultiple } from './upload.middleware.js';

router.post('/upload-multiple', uploadMultiple('files', 5), (req, res) => {
  const files = req.files; // Array of files
  res.json({ files });
});
```

#### Multiple Fields

```typescript
import { uploadFields } from './upload.middleware.js';

router.post('/upload-fields', 
  uploadFields([
    { name: 'avatar', maxCount: 1 },
    { name: 'documents', maxCount: 5 },
  ]),
  (req, res) => {
    const avatar = req.files.avatar[0];
    const documents = req.files.documents;
    res.json({ avatar, documents });
  }
);
```

### Configuration

- **Storage**: Files saved to `uploads/` directory (or `/app/uploads` in Docker)
- **File Size Limit**: 100MB
- **File Naming**: `{fieldname}-{timestamp}-{random}.{ext}`
- **Docker Support**: Volume mounted at `./backend/uploads:/app/uploads`

### File Filter

Currently accepts all file types. To restrict:

```typescript
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};
```

### Docker Volume

The uploads directory is mounted as a volume in `docker-compose.yml`:
```yaml
volumes:
  - ./backend/uploads:/app/uploads
```

This ensures uploaded files persist even when containers are recreated.

