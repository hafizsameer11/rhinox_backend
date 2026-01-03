# Core Utilities

## ApiError

Custom error class for consistent API error handling.

### Usage

```typescript
import ApiError from './ApiError.js';

// Throw errors
throw ApiError.unauthorized('You are not logged in');
throw ApiError.badRequest('Invalid input');
throw ApiError.notFound('User not found');
throw ApiError.internal('Database error');
```

### Available Methods

- `ApiError.badRequest(message)` - 400
- `ApiError.unauthorized(message)` - 401
- `ApiError.forbidden(message)` - 403
- `ApiError.notFound(message)` - 404
- `ApiError.conflict(message)` - 409
- `ApiError.unprocessableEntity(message)` - 422
- `ApiError.internal(message)` - 500
- `ApiError.serviceUnavailable(message)` - 503

### Error Handling in Express

The error handler in `server.ts` automatically handles `ApiError` instances:

```typescript
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }
  // Handle other errors...
});
```

## authUtils

JWT token utilities for authentication.

### Functions

#### `verifyToken(token: string)`

Verifies JWT token and returns decoded payload.

```typescript
import { verifyToken } from './authUtils.js';

const decoded = await verifyToken(token);
if (decoded) {
  const userId = decoded.id;
}
```

#### `generateAccessToken(userId: string)`

Generates JWT access token.

```typescript
import { generateAccessToken } from './authUtils.js';

const token = generateAccessToken(userId);
```

#### `generateRefreshToken(userId: string)`

Generates JWT refresh token.

```typescript
import { generateRefreshToken } from './authUtils.js';

const refreshToken = generateRefreshToken(userId);
```

