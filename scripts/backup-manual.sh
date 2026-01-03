#!/bin/bash
# Manual Backup Script - Run from host machine
# Usage: ./scripts/backup-manual.sh

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_FILE="${BACKUP_DIR}/rhinox_pay_${TIMESTAMP}.sql"

# Create backups directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

echo "Creating MySQL backup..."

# Create backup using docker exec
docker exec rhinox_mysql mysqldump \
  -u rhinox \
  -prhinox \
  --single-transaction \
  --routines \
  --triggers \
  rhinox_pay > "${BACKUP_FILE}"

# Compress backup
gzip "${BACKUP_FILE}"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

echo "✅ Backup created: ${COMPRESSED_FILE}"
echo "📦 Backup size: $(du -h ${COMPRESSED_FILE} | cut -f1)"

