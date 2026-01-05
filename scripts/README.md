# Postman Collection Generator

This script automatically generates a complete Postman collection from your Swagger/OpenAPI specification.

## Usage

### Method 1: Generate from Running Server (Recommended)

Make sure your backend server is running, then:

```bash
# From project root
npm run generate:postman

# Or with custom base URL
node scripts/generate-postman-collection.js http://localhost:3000
```

### Method 2: Generate from Swagger File

If you've saved the Swagger JSON to a file:

```bash
# First, save the Swagger JSON (while server is running)
curl http://localhost:3000/api-docs.json > backend/swagger-output.json

# Then generate from file
npm run generate:postman:file
```

## Output

The script generates: `Rhinox_Pay_API.postman_collection.json`

This file contains:
- ✅ All API endpoints organized by tags/modules
- ✅ Request bodies with example data
- ✅ Authentication headers (Bearer tokens)
- ✅ Query parameters
- ✅ Path parameters
- ✅ Collection variables (`baseUrl`, `accessToken`, `refreshToken`)

## Importing to Postman

1. Open Postman
2. Click **Import** button
3. Select `Rhinox_Pay_API.postman_collection.json`
4. The collection will be imported with all endpoints organized in folders

## Collection Variables

The collection includes these variables:
- `baseUrl` - Default: `http://localhost:3000`
- `accessToken` - JWT access token (set after login)
- `refreshToken` - JWT refresh token (set after login)

## Auto-Setting Tokens

After importing, you can add a **Pre-request Script** to the collection to automatically extract and set tokens from login/register responses:

```javascript
// Add this to Collection > Pre-request Script tab
if (pm.response && pm.response.json) {
    const json = pm.response.json();
    if (json.data && json.data.accessToken) {
        pm.collectionVariables.set("accessToken", json.data.accessToken);
    }
    if (json.data && json.data.refreshToken) {
        pm.collectionVariables.set("refreshToken", json.data.refreshToken);
    }
}
```

## Regenerating the Collection

Whenever you add new endpoints or update Swagger documentation:

1. Make sure your server is running
2. Run: `npm run generate:postman`
3. Re-import the updated collection in Postman

## Features

- ✅ Automatically fetches from `/api-docs.json`
- ✅ Converts all OpenAPI 3.0 paths to Postman requests
- ✅ Groups endpoints by Swagger tags
- ✅ Includes request examples from schemas
- ✅ Adds authentication headers where required
- ✅ Handles query and path parameters
- ✅ Generates proper request bodies

## Troubleshooting

**Error: Failed to fetch Swagger JSON**
- Make sure your server is running on the specified port
- Check that `/api-docs.json` endpoint is accessible
- Verify the base URL is correct

**Collection missing endpoints**
- Ensure all controllers have `@swagger` documentation
- Check that Swagger tags are properly set
- Verify the server is returning complete Swagger spec

