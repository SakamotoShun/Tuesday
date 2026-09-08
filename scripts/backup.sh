#!/bin/bash
set -euo pipefail
umask 077

CONTAINER_NAME="${CONTAINER_NAME:-tuesday}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_LAST_N="${KEEP_LAST_N:-14}"
BACKUP_UPLOAD_CMD="${BACKUP_UPLOAD_CMD:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_TMP=""
TMP_DIR=$(mktemp -d)
BACKUP_ID="$(date +%s)_$$_$RANDOM"
MAINTENANCE_LOCK="/app/data/.maintenance-lock"
LOCK_OWNER="$MAINTENANCE_LOCK/owner"
LOCK_ACQUIRED=false
APP_STOPPED_BY_BACKUP=false

wait_until_ready() {
    local attempts=60
    while [ "$attempts" -gt 0 ]; do
        if docker exec "$CONTAINER_NAME" curl -fsS --max-time 2 http://127.0.0.1:8080/ready >/dev/null 2>&1; then
            return 0
        fi
        attempts=$((attempts - 1))
        sleep 1
    done
    return 1
}

cleanup() {
    local exit_code=$?
    trap - EXIT
    trap '' INT TERM
    set +e
    rm -rf "$TMP_DIR" || true
    if [ -n "$ARCHIVE_TMP" ]; then
        rm -f "$ARCHIVE_TMP" || true
    fi
    if [ "$APP_STOPPED_BY_BACKUP" = true ]; then
        docker exec "$CONTAINER_NAME" supervisorctl stop tuesday >/dev/null 2>&1 || true
        if ! docker exec "$CONTAINER_NAME" supervisorctl start tuesday >/dev/null || ! wait_until_ready; then
            echo "ERROR: backup finished but Tuesday did not become ready after restart." >&2
            docker exec "$CONTAINER_NAME" supervisorctl stop tuesday >/dev/null 2>&1 || true
            exit_code=1
        fi
    fi
    if [ "$LOCK_ACQUIRED" = true ]; then
        if ! docker exec "$CONTAINER_NAME" sh -eu -c '
            lock="$1"
            owner_file="$2"
            expected_owner="$3"
            [ "$(cat "$owner_file")" = "$expected_owner" ]
            rm "$owner_file"
            rmdir "$lock"
        ' sh "$MAINTENANCE_LOCK" "$LOCK_OWNER" "$BACKUP_ID" >/dev/null 2>&1; then
            echo "WARNING: maintenance lock ownership changed; verify it manually: $MAINTENANCE_LOCK" >&2
            exit_code=1
        fi
    fi
    exit "$exit_code"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$BACKUP_DIR"

if ! docker exec "$CONTAINER_NAME" sh -eu -c '
    lock="$1"
    owner_file="$2"
    owner="$3"
    mkdir "$lock"
    printf "%s\n" "$owner" > "$owner_file"
' sh "$MAINTENANCE_LOCK" "$LOCK_OWNER" "$BACKUP_ID" >/dev/null 2>&1; then
    echo "ERROR: another backup or restore is active, or a stale lock exists at $MAINTENANCE_LOCK" >&2
    exit 1
fi
LOCK_ACQUIRED=true

# Supervisor returns 3 for a stopped process, not just for command failures.
APP_STATUS=$(docker exec "$CONTAINER_NAME" supervisorctl status tuesday) || [ "$?" -eq 3 ]
if [[ "$APP_STATUS" == *" STOPPED "* ]]; then
    :
elif [[ "$APP_STATUS" == *" RUNNING "* || "$APP_STATUS" == *" STARTING "* || \
    "$APP_STATUS" == *" STOPPING "* || "$APP_STATUS" == *" BACKOFF "* ]]; then
    APP_STOPPED_BY_BACKUP=true
    docker exec "$CONTAINER_NAME" supervisorctl stop tuesday >/dev/null
    APP_STATUS=$(docker exec "$CONTAINER_NAME" supervisorctl status tuesday) || [ "$?" -eq 3 ]
    if [[ "$APP_STATUS" != *" STOPPED "* ]]; then
        echo "ERROR: Tuesday did not reach STOPPED state; backup aborted." >&2
        exit 1
    fi
else
    echo "ERROR: Tuesday has an unsupported Supervisor state; backup aborted: $APP_STATUS" >&2
    exit 1
fi

echo "Creating database dump..."
docker exec "$CONTAINER_NAME" pg_dump --clean --if-exists --no-owner --no-privileges -U tuesday tuesday > "$TMP_DIR/database.sql"

echo "Copying uploads snapshot..."
mkdir -p "$TMP_DIR/uploads"
if ! docker cp "$CONTAINER_NAME:/app/data/uploads/." "$TMP_DIR/uploads/"; then
    echo "ERROR: failed to copy uploads from $CONTAINER_NAME; aborting backup so restore.sh is not left with an empty uploads snapshot." >&2
    exit 1
fi

# The local snapshot is complete; compression and off-site upload need no downtime.
if [ "$APP_STOPPED_BY_BACKUP" = true ]; then
    docker exec "$CONTAINER_NAME" supervisorctl start tuesday >/dev/null
    wait_until_ready
    APP_STOPPED_BY_BACKUP=false
fi

cat > "$TMP_DIR/metadata.env" <<EOF
BACKUP_CREATED_AT=$TIMESTAMP
CONTAINER_NAME=$CONTAINER_NAME
FORMAT=tuesday-backup-v2
EOF

ARCHIVE_TMP=$(mktemp "$BACKUP_DIR/tuesday_backup_${TIMESTAMP}_XXXXXX.partial")
ARCHIVE_FILE="${ARCHIVE_TMP%.partial}.tar.gz"
echo "Creating archive: $ARCHIVE_FILE"
tar -czf "$ARCHIVE_TMP" -C "$TMP_DIR" database.sql uploads metadata.env
mv "$ARCHIVE_TMP" "$ARCHIVE_FILE"
ARCHIVE_TMP=""

if [ -n "$BACKUP_UPLOAD_CMD" ]; then
    echo "Running backup upload hook..."
    if [ -x "$BACKUP_UPLOAD_CMD" ]; then
        BACKUP_FILE_PATH="$ARCHIVE_FILE" "$BACKUP_UPLOAD_CMD"
    else
        BACKUP_FILE_PATH="$ARCHIVE_FILE" sh -c "$BACKUP_UPLOAD_CMD"
    fi
fi

mapfile -t backups < <(ls -1t "$BACKUP_DIR"/tuesday_backup_*.tar.gz 2>/dev/null || true)
if [ "$KEEP_LAST_N" -gt 0 ] && [ "${#backups[@]}" -gt "$KEEP_LAST_N" ]; then
    for stale_backup in "${backups[@]:$KEEP_LAST_N}"; do
        rm -f "$stale_backup"
    done
fi

SIZE=$(du -h "$ARCHIVE_FILE" | cut -f1)
echo "Backup snapshot created: $ARCHIVE_FILE ($SIZE)"
