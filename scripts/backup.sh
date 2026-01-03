#!/bin/bash
# MySQL Backup Script
# This script creates a timestamped backup of the MySQL database

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/rhinox_pay_${TIMESTAMP}.sql"
RETENTION_DAYS=7

echo "Starting MySQL backup at $(date)"

# Create backup
mysqldump \
  -h "${MYSQL_HOST}" \
  -u "${MYSQL_USER}" \
  -p"${MYSQL_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  "${MYSQL_DATABASE}" > "${BACKUP_FILE}"

# Compress backup
gzip "${BACKUP_FILE}"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

echo "Backup created: ${COMPRESSED_FILE}"
echo "Backup size: $(du -h ${COMPRESSED_FILE} | cut -f1)"

# Remove old backups (older than retention days)
find "${BACKUP_DIR}" -name "rhinox_pay_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

echo "Backup completed at $(date)"
echo "Old backups (older than ${RETENTION_DAYS} days) have been removed"

