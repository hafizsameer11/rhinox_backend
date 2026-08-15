#!/bin/sh
set -e

echo "[entrypoint] Syncing Prisma schema with database..."
if npx prisma db push --skip-generate; then
  echo "[entrypoint] Database schema synced successfully."
else
  echo "[entrypoint] WARNING: prisma db push failed. Starting server anyway."
fi

echo "[entrypoint] Regenerating Prisma client..."
npx prisma generate || echo "[entrypoint] WARNING: prisma generate failed."

echo "[entrypoint] Starting application..."
exec "$@"
