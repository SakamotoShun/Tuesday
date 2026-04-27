#!/bin/bash
set -e

CONTAINER_NAME="${CONTAINER_NAME:-tuesday}"
ASSUME_YES=false
BACKUP_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y)
            ASSUME_YES=true
            ;;
        *)
            BACKUP_FILE="$1"
            ;;
    esac
    shift
done

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: ./scripts/restore.sh [--yes] <backup_file>"
    echo ""
    echo "Supported formats: .tar.gz, .sql, .sql.gz"
    echo "Example: ./scripts/restore.sh --yes backups/tuesday_backup_20260101_120000.tar.gz"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will overwrite the current database!"
echo "Backup file: $BACKUP_FILE"
if [ "$ASSUME_YES" != true ]; then
    read -p "Are you sure? (y/N) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Restore cancelled."
        exit 1
    fi
fi

echo "Restoring from: $BACKUP_FILE"

if [[ "$BACKUP_FILE" == *.tar.gz ]]; then
    TMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TMP_DIR"' EXIT

    tar -xzf "$BACKUP_FILE" -C "$TMP_DIR"

    if [ ! -f "$TMP_DIR/database.sql" ]; then
        echo "Error: archive does not contain database.sql"
        exit 1
    fi

    cat "$TMP_DIR/database.sql" | docker exec -i "$CONTAINER_NAME" psql -U tuesday tuesday

    if [ -d "$TMP_DIR/uploads" ]; then
        docker exec "$CONTAINER_NAME" sh -c 'rm -rf /app/data/uploads && mkdir -p /app/data/uploads'
        docker cp "$TMP_DIR/uploads/." "$CONTAINER_NAME:/app/data/uploads/"
    fi
elif [[ "$BACKUP_FILE" == *.sql.gz ]]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U tuesday tuesday
else
    cat "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U tuesday tuesday
fi

echo "Restore complete!"
