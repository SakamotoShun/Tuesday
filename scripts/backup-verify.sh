#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
VERIFY_CONTAINER="tuesday-backup-verify-$$"
BACKUP_FILE="${1:-}"
TMP_DIR=$(mktemp -d)

cleanup() {
    docker rm -f "$VERIFY_CONTAINER" >/dev/null 2>&1 || true
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [ -z "$BACKUP_FILE" ]; then
    mapfile -t backups < <(ls -1t "$BACKUP_DIR"/tuesday_backup_*.tar.gz 2>/dev/null || true)
    if [ "${#backups[@]}" -eq 0 ]; then
        echo "Error: no backup archives found in $BACKUP_DIR"
        exit 1
    fi
    BACKUP_FILE="${backups[0]}"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "Verifying backup archive: $BACKUP_FILE"
tar -xzf "$BACKUP_FILE" -C "$TMP_DIR"

if [ ! -f "$TMP_DIR/database.sql" ]; then
    echo "Error: archive is missing database.sql"
    exit 1
fi

if [ ! -d "$TMP_DIR/uploads" ]; then
    echo "Error: archive is missing uploads directory"
    exit 1
fi

docker run -d --rm \
    --name "$VERIFY_CONTAINER" \
    -e POSTGRES_USER=tuesday \
    -e POSTGRES_PASSWORD=tuesday \
    -e POSTGRES_DB=tuesday \
    "$POSTGRES_IMAGE" >/dev/null

echo "Waiting for temporary PostgreSQL instance..."
for _ in $(seq 1 30); do
    if docker exec "$VERIFY_CONTAINER" pg_isready -U tuesday -d tuesday >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! docker exec "$VERIFY_CONTAINER" pg_isready -U tuesday -d tuesday >/dev/null 2>&1; then
    echo "Error: verification database did not become ready"
    exit 1
fi

cat "$TMP_DIR/database.sql" | docker exec -i "$VERIFY_CONTAINER" psql -U tuesday tuesday >/dev/null

MIGRATION_COUNT=$(docker exec "$VERIFY_CONTAINER" psql -U tuesday -d tuesday -t -A -c "SELECT count(*) FROM drizzle_migrations;")
TABLE_COUNT=$(docker exec "$VERIFY_CONTAINER" psql -U tuesday -d tuesday -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
UPLOAD_FILE_COUNT=$(find "$TMP_DIR/uploads" -type f | wc -l | tr -d ' ')

echo "Backup verified successfully"
echo "- Applied migrations: $MIGRATION_COUNT"
echo "- Public tables: $TABLE_COUNT"
echo "- Uploaded files archived: $UPLOAD_FILE_COUNT"
