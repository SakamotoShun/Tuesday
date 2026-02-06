#!/bin/bash
set -e

CONTAINER_NAME="${CONTAINER_NAME:-tuesday}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tuesday_backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_FILE"
docker exec "$CONTAINER_NAME" pg_dump -U tuesday tuesday > "$BACKUP_FILE"

echo "Compressing backup..."
gzip "$BACKUP_FILE"

SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo "Backup complete: ${BACKUP_FILE}.gz ($SIZE)"
