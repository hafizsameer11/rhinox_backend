# Dokploy Setup Guide - Quick Fix

## Error: "failed to read dockerfile: open code: no such file or directory"

This error occurs when Dokploy can't find the Dockerfile. Follow these steps:

## Solution

### Step 1: Verify Repository Structure

Your repository `rhinox_backend` should have the Dockerfile at the root:

```
rhinox_backend/
├── Dockerfile          ← Must be here
├── package.json
├── src/
├── prisma/
└── ...
```

### Step 2: Configure Dokploy Build Settings

In Dokploy, go to your application settings and configure:

**Build Settings:**
- **Build Context:** `.` (dot - current directory)
- **Dockerfile Path:** `Dockerfile` (or leave empty if Dockerfile is at root)
- **Dockerfile Name:** `Dockerfile` (if there's a field for this)

**OR if Dokploy has different fields:**

- **Root Directory:** `.` or leave empty
- **Dockerfile:** `Dockerfile`
- **Build Context:** `.`

### Step 3: Alternative - If Repository is in Subfolder

If your repository structure is:
```
your-repo/
└── backend/
    ├── Dockerfile
    └── ...
```

Then in Dokploy:
- **Build Context:** `./backend` or `backend`
- **Dockerfile Path:** `Dockerfile` or `backend/Dockerfile`

### Step 4: Verify Dockerfile Exists

Make sure the Dockerfile is committed to your repository:

```bash
# Check if Dockerfile exists
ls -la Dockerfile

# If not, add it
git add Dockerfile
git commit -m "Add Dockerfile for Dokploy"
git push
```

### Step 5: Retry Deployment

After fixing the configuration, retry the deployment in Dokploy.

## Common Dokploy Configuration Issues

### Issue 1: Build Context Wrong
**Symptom:** `failed to read dockerfile: open code`
**Solution:** Set Build Context to `.` (current directory)

### Issue 2: Dockerfile Not in Repository
**Symptom:** `no such file or directory`
**Solution:** Ensure Dockerfile is committed and pushed to repository

### Issue 3: Wrong Dockerfile Path
**Symptom:** `failed to read dockerfile`
**Solution:** Set Dockerfile path to `Dockerfile` (if at root) or `backend/Dockerfile` (if in subfolder)

## Dokploy Configuration Checklist

- [ ] Repository cloned successfully
- [ ] Dockerfile exists in repository root
- [ ] Build Context set to `.` (or correct subfolder)
- [ ] Dockerfile Path set to `Dockerfile`
- [ ] Environment variables configured
- [ ] Volume mounted at `/app/uploads`
- [ ] Port 3000 exposed

## Quick Test

To test if Dockerfile is correct, you can build locally:

```bash
# In your repository root
docker build -t test-build -f Dockerfile .

# If successful, the Dockerfile is correct
```

## Still Having Issues?

1. **Check Dokploy Logs:** Look for more detailed error messages
2. **Verify Repository:** Make sure Dockerfile is in the repository
3. **Check Permissions:** Ensure Dokploy has access to the repository
4. **Contact Support:** If issue persists, check Dokploy documentation or support

---

**Note:** The Dockerfile in this repository is production-ready and should work with Dokploy once the build context is configured correctly.
