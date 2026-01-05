# 📬 Postman Collection Guide

## ✅ What Was Created

A complete Postman collection has been generated from your Swagger API documentation:

- **File**: `Rhinox_Pay_API.postman_collection.json`
- **Total Folders**: 20 (organized by API modules)
- **Total Requests**: 91 endpoints

## 🚀 Quick Start

### 1. Import to Postman

1. Open Postman
2. Click **Import** button (top left)
3. Select `Rhinox_Pay_API.postman_collection.json`
4. Done! All endpoints are now available

### 2. Set Up Authentication

The collection includes auto-token extraction. After importing:

1. Go to **Auth** folder
2. Run **"Login user"** or **"Register a new user account"** request
3. Tokens will be automatically saved to collection variables
4. All protected endpoints will use the token automatically

### 3. Configure Base URL (if needed)

- Collection variable `baseUrl` is set to `http://localhost:3000` by default
- To change: Click on collection name → Variables tab → Edit `baseUrl`

## 📁 Collection Structure

The collection is organized into folders matching your API modules:

- **Auth** - Authentication & user management
- **Bank Accounts** - Public bank account info
- **Conversion** - Currency conversion
- **Country** - Country data
- **Crypto** - Cryptocurrency operations
- **Deposit** - Fiat deposits
- **Exchange** - Exchange rates
- **Home** - Dashboard data
- **KYC** - KYC verification
- **P2P** - P2P marketplace (multiple sub-folders)
- **P2P Chat** - Order chat messages
- **P2P Review** - User reviews
- **Payment Settings** - Payment methods
- **Transfer** - Money transfers
- **Wallet** - Wallet management
- **Health** - Health check endpoints

## 🔄 Regenerating the Collection

Whenever you update your API or add new endpoints:

```bash
# Make sure server is running
npm run dev

# In another terminal, generate collection
npm run generate:postman
```

Then re-import the updated collection in Postman.

## 🛠️ Script Usage

### Generate from Running Server
```bash
npm run generate:postman
# or
node scripts/generate-postman-collection.js http://localhost:3000
```

### Generate from File
```bash
# First save Swagger JSON
curl http://localhost:3000/api-docs.json > backend/swagger-output.json

# Then generate
npm run generate:postman:file
```

## ✨ Features

- ✅ **Auto-token extraction** - Tokens from login/register are automatically saved
- ✅ **Request examples** - All requests include example bodies
- ✅ **Authentication headers** - Bearer tokens added automatically
- ✅ **Query parameters** - All query params included
- ✅ **Path parameters** - Properly formatted in URLs
- ✅ **Organized by modules** - Easy to find endpoints

## 📝 Collection Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `baseUrl` | `http://localhost:3000` | API base URL |
| `accessToken` | (empty) | JWT access token (auto-set after login) |
| `refreshToken` | (empty) | JWT refresh token (auto-set after login) |

## 🎯 Testing Workflow

1. **Import collection** to Postman
2. **Run "Register"** or **"Login"** request
3. Tokens are automatically saved
4. **Test any protected endpoint** - authentication is handled automatically
5. **Update collection** whenever API changes

## 📚 More Information

See `scripts/README.md` for detailed script documentation.

---

**Happy Testing! 🎉**

