#!/bin/bash
set -e

CONTAINER_NAME="${CONTAINER_NAME:-tuesday}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_LAST_N="${KEEP_LAST_N:-14}"
BACKUP_UPLOAD_CMD="${BACKUP_UPLOAD_CMD:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_FILE="$BACKUP_DIR/tuesday_backup_$TIMESTAMP.tar.gz"
TMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

mkdir -p "$BACKUP_DIR"

echo "Creating database dump..."
docker exec "$CONTAINER_NAME" pg_dump --clean --if-exists --no-owner --no-privileges -U tuesday tuesday > "$TMP_DIR/database.sql"

echo "Copying uploads snapshot..."
mkdir -p "$TMP_DIR/uploads"
docker cp "$CONTAINER_NAME:/app/data/uploads/." "$TMP_DIR/uploads/" 2>/dev/null || true

cat > "$TMP_DIR/metadata.env" <<EOF
BACKUP_CREATED_AT=$TIMESTAMP
CONTAINER_NAME=$CONTAINER_NAME
FORMAT=tuesday-backup-v2
EOF

echo "Creating archive: $ARCHIVE_FILE"
tar -czf "$ARCHIVE_FILE" -C "$TMP_DIR" database.sql uploads metadata.env

if [ -n "$BACKUP_UPLOAD_CMD" ]; then
    echo "Running backup upload hook..."
    BACKUP_FILE_PATH="$ARCHIVE_FILE" sh -c "$BACKUP_UPLOAD_CMD"
fi

mapfile -t backups < <(ls -1t "$BACKUP_DIR"/tuesday_backup_*.tar.gz 2>/dev/null || true)
if [ "$KEEP_LAST_N" -gt 0 ] && [ "${#backups[@]}" -gt "$KEEP_LAST_N" ]; then
    for stale_backup in "${backups[@]:$KEEP_LAST_N}"; do
        rm -f "$stale_backup"
    done
fi

SIZE=$(du -h "$ARCHIVE_FILE" | cut -f1)
echo "Backup complete: $ARCHIVE_FILE ($SIZE)"
