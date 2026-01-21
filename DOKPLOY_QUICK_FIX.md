# Dokploy Quick Fix - "failed to read dockerfile: open code"

## The Problem

Dokploy is trying to read a file called "code" as the Dockerfile, which doesn't exist.

## The Solution

### In Dokploy Dashboard:

1. **Go to your application settings**
2. **Find "Build Settings" or "Docker Settings"**
3. **Set these values:**

```
Build Context: .
Dockerfile: Dockerfile
```

OR if Dokploy uses different field names:

```
Root Directory: .
Dockerfile Path: Dockerfile
Dockerfile Name: Dockerfile
```

### Important Notes:

- **Build Context** should be `.` (dot) - this means "current directory"
- **Dockerfile** should be `Dockerfile` (the actual filename)
- If your repo root IS the backend folder, use `.` as build context
- If backend is a subfolder, use `./backend` or `backend` as build context

## Step-by-Step Fix

1. Open Dokploy dashboard
2. Go to your application: `rhinoxpay-ackend-elx6ys`
3. Click "Settings" or "Configuration"
4. Find "Build" or "Docker" section
5. Set:
   - Build Context: `.`
   - Dockerfile: `Dockerfile`
6. Save settings
7. Retry deployment

## Verify Dockerfile Exists

Make sure Dockerfile is in your repository root:

```bash
# Check repository
git ls-files | grep Dockerfile

# Should show:
# Dockerfile
```

If not, commit and push:

```bash
git add Dockerfile
git commit -m "Add Dockerfile"
git push
```

## After Fixing

Once configured correctly, the build should work. The Dockerfile is production-ready and includes:

- ✅ Multi-stage build
- ✅ TypeScript compilation
- ✅ Prisma setup
- ✅ Health checks
- ✅ Volume support for uploads
- ✅ Security (non-root user)

## Still Not Working?

1. Check Dokploy logs for more details
2. Verify repository has Dockerfile at root
3. Try setting Dockerfile path explicitly: `./Dockerfile`
4. Check Dokploy documentation for your version

---

**Quick Test:** The Dockerfile works. The issue is Dokploy configuration. Set Build Context to `.` and Dockerfile to `Dockerfile`.
