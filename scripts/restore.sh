#!/bin/bash
set -e

CONTAINER_NAME="${CONTAINER_NAME:-tuesday}"
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: ./scripts/restore.sh <backup_file>"
    echo ""
    echo "Supported formats: .sql, .sql.gz"
    echo "Example: ./scripts/restore.sh backups/tuesday_backup_20260101_120000.sql.gz"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will overwrite the current database!"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 1
fi

echo "Restoring from: $BACKUP_FILE"

if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U tuesday tuesday
else
    cat "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U tuesday tuesday
fi

echo "Restore complete!"
