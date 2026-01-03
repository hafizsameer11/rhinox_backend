#!/bin/bash
# MySQL Restore Script
# Usage: ./scripts/restore.sh <backup-file.sql.gz>

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Please provide a backup file"
  echo "Usage: ./scripts/restore.sh <backup-file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  WARNING: This will replace all data in the database!"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

echo "Restoring database from: $BACKUP_FILE"

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "Decompressing backup..."
  gunzip -c "$BACKUP_FILE" | docker exec -i rhinox_mysql mysql \
    -u rhinox \
    -prhinox \
    rhinox_pay
else
  cat "$BACKUP_FILE" | docker exec -i rhinox_mysql mysql \
    -u rhinox \
    -prhinox \
    rhinox_pay
fi

echo "✅ Database restored successfully!"

