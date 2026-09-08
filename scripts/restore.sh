#!/bin/bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-tuesday}"
ASSUME_YES=false
BACKUP_FILE=""
APP_STOPPED=false
APP_RUNNING=false
TMP_DIR=""
RESTORE_ID="$(date +%s)_$$_$RANDOM"
RESTORE_LOCK="/app/data/.maintenance-lock"
RESTORE_LOCK_OWNER="$RESTORE_LOCK/owner"
UPLOAD_STAGING="/app/data/.uploads-restore-$RESTORE_ID"
UPLOAD_PREVIOUS="/app/data/.uploads-previous-$RESTORE_ID"
RESTORE_DB="tuesday_restore_$RESTORE_ID"
PREVIOUS_DB="tuesday_previous_$RESTORE_ID"
FAILED_DB="tuesday_failed_$RESTORE_ID"
DB_SWAPPED=false
UPLOAD_SWAP_STARTED=false
UPLOAD_HAD_PREVIOUS=false
RESTORE_COMMITTED=false
RESTART_SAFE=true
LOCK_ACQUIRED=false
UPLOAD_STAGING_CREATED=false
RESTORE_DB_CREATED=false

terminate_restore_connections() {
    docker exec -u postgres "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('tuesday', '$RESTORE_DB', '$PREVIOUS_DB', '$FAILED_DB') AND pid <> pg_backend_pid();" \
        >/dev/null
}

database_presence() {
    docker exec -u postgres "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -At -d postgres -c \
        "SELECT 1 FROM pg_database WHERE datname = '$1'"
}

rollback_database_swap() {
    local previous_exists
    local current_exists
    local failed_exists
    terminate_restore_connections || return 1
    previous_exists=$(database_presence "$PREVIOUS_DB") || return 1
    if [ "$previous_exists" = 1 ]; then
        current_exists=$(database_presence tuesday) || return 1
        if [ "$current_exists" = 1 ]; then
            docker exec -u postgres "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -d postgres -c \
                "ALTER DATABASE tuesday RENAME TO $FAILED_DB" >/dev/null || return 1
        fi
        if ! docker exec -u postgres "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -d postgres -c \
            "ALTER DATABASE $PREVIOUS_DB RENAME TO tuesday" >/dev/null; then
            failed_exists=$(database_presence "$FAILED_DB") || return 1
            if [ "$failed_exists" = 1 ]; then
                docker exec -u postgres "$CONTAINER_NAME" psql -d postgres -c \
                    "ALTER DATABASE $FAILED_DB RENAME TO tuesday" >/dev/null 2>&1 || true
            fi
            return 1
        fi
        docker exec -u postgres "$CONTAINER_NAME" dropdb --if-exists "$FAILED_DB" >/dev/null 2>&1 || true
    fi
    DB_SWAPPED=false
}

rollback_upload_swap() {
    docker exec "$CONTAINER_NAME" sh -eu -c '
        previous="$1"
        had_previous="$2"
        if [ -e "$previous" ]; then
            rm -rf /app/data/uploads
            mv "$previous" /app/data/uploads
        elif [ "$had_previous" = false ]; then
            rm -rf /app/data/uploads
            mkdir -p /app/data/uploads
        fi
        chown -R tuesday:tuesday /app/data/uploads
    ' sh "$UPLOAD_PREVIOUS" "$UPLOAD_HAD_PREVIOUS" || return 1
    UPLOAD_SWAP_STARTED=false
}

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

stop_app() {
    local status
    docker exec "$CONTAINER_NAME" supervisorctl stop tuesday >/dev/null || return 1
    status=$(docker exec "$CONTAINER_NAME" supervisorctl status tuesday) || [ "$?" -eq 3 ] || return 1
    [[ "$status" == *" STOPPED "* ]]
}

restart_app_and_wait() {
    stop_app || return 1
    docker exec "$CONTAINER_NAME" supervisorctl start tuesday >/dev/null || return 1
    wait_until_ready
}

cleanup() {
    local exit_code=$?
    trap - EXIT
    trap '' INT TERM
    set +e
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR" || true
    fi
    if [ "$UPLOAD_STAGING_CREATED" = true ]; then
        docker exec "$CONTAINER_NAME" rm -rf "$UPLOAD_STAGING" >/dev/null 2>&1 || true
    fi
    if [ "$RESTORE_COMMITTED" != true ] && [ "$APP_RUNNING" = true ]; then
        if ! stop_app; then
            echo "ERROR: could not stop Tuesday; rollback was NOT attempted. Previous data and maintenance lock retained for manual recovery." >&2
            return 1
        fi
        APP_RUNNING=false
        APP_STOPPED=true
    fi
    if [ "$RESTORE_COMMITTED" != true ] && [ "$UPLOAD_SWAP_STARTED" = true ]; then
        if ! rollback_upload_swap; then
            RESTART_SAFE=false
            echo "ERROR: upload rollback failed; Tuesday remains stopped for manual recovery." >&2
        fi
    fi
    if [ "$RESTORE_COMMITTED" != true ] && [ "$DB_SWAPPED" = true ]; then
        if ! rollback_database_swap; then
            RESTART_SAFE=false
            echo "ERROR: database rollback failed; Tuesday remains stopped for manual recovery." >&2
        fi
    fi
    if [ "$RESTORE_DB_CREATED" = true ]; then
        docker exec -u postgres "$CONTAINER_NAME" dropdb --if-exists "$RESTORE_DB" >/dev/null 2>&1 || true
    fi
    if [ "$RESTORE_COMMITTED" != true ] && [ "$APP_STOPPED" = true ]; then
        if [ "$RESTART_SAFE" = true ]; then
            if restart_app_and_wait; then
                APP_RUNNING=true
                APP_STOPPED=false
            else
                echo "ERROR: Tuesday did not become ready after rollback; it remains stopped for manual recovery." >&2
                docker exec "$CONTAINER_NAME" supervisorctl stop tuesday >/dev/null 2>&1 || true
                RESTART_SAFE=false
            fi
        else
            echo "ERROR: restore did not reach a recoverable state; Tuesday was not restarted." >&2
        fi
    fi
    if [ "$LOCK_ACQUIRED" = true ] && [ "$RESTART_SAFE" = true ]; then
        if ! docker exec "$CONTAINER_NAME" sh -eu -c '
            lock="$1"
            owner_file="$2"
            expected_owner="$3"
            [ "$(cat "$owner_file")" = "$expected_owner" ]
            rm "$owner_file"
            rmdir "$lock"
        ' sh "$RESTORE_LOCK" "$RESTORE_LOCK_OWNER" "$RESTORE_ID" >/dev/null 2>&1; then
            echo "WARNING: restore lock ownership changed; verify it manually: $RESTORE_LOCK" >&2
            exit_code=1
        fi
    elif [ "$LOCK_ACQUIRED" = true ]; then
        echo "ERROR: restore lock retained for manual recovery: $RESTORE_LOCK" >&2
    fi
    return "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
    echo "Supported format: Tuesday .tar.gz full snapshot"
    echo "Example: ./scripts/restore.sh --yes backups/tuesday_backup_20260101_120000.tar.gz"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [[ "$BACKUP_FILE" != *.tar.gz ]]; then
    echo "Error: restore requires a Tuesday .tar.gz full snapshot containing database and uploads" >&2
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
TMP_DIR=$(mktemp -d)
tar --no-same-owner -xzf "$BACKUP_FILE" -C "$TMP_DIR"

if [ ! -f "$TMP_DIR/database.sql" ] || [ ! -d "$TMP_DIR/uploads" ] || [ ! -f "$TMP_DIR/metadata.env" ]; then
    echo "Error: archive is not a complete Tuesday backup (database.sql, uploads/, and metadata.env are required)" >&2
    exit 1
fi
if ! grep -qx 'FORMAT=tuesday-backup-v2' "$TMP_DIR/metadata.env"; then
    echo "Error: archive has an unsupported Tuesday backup format" >&2
    exit 1
fi

if ! docker exec "$CONTAINER_NAME" sh -eu -c '
    lock="$1"
    owner_file="$2"
    owner="$3"
    mkdir "$lock"
    printf "%s\n" "$owner" > "$owner_file"
' sh "$RESTORE_LOCK" "$RESTORE_LOCK_OWNER" "$RESTORE_ID" >/dev/null 2>&1; then
    echo "ERROR: another restore is active or a stale lock exists at $RESTORE_LOCK" >&2
    echo "Verify no restore is running before removing the lock." >&2
    exit 1
fi
LOCK_ACQUIRED=true

if ! scratch_databases=$(docker exec -u postgres "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -At -d postgres -c \
    "SELECT datname FROM pg_database WHERE datname IN ('$RESTORE_DB', '$PREVIOUS_DB', '$FAILED_DB')"); then
    echo "ERROR: could not inspect PostgreSQL before restore; no data was changed." >&2
    exit 1
fi
if [ -n "$scratch_databases" ]; then
    echo "ERROR: restore scratch database name collision; no data was changed." >&2
    exit 1
fi
if docker exec "$CONTAINER_NAME" test -e "$UPLOAD_STAGING" || \
    docker exec "$CONTAINER_NAME" test -e "$UPLOAD_PREVIOUS"; then
    echo "ERROR: restore scratch upload path collision; no data was changed." >&2
    exit 1
fi

APP_STOPPED=true
stop_app

UPLOAD_STAGING_CREATED=true
docker exec "$CONTAINER_NAME" mkdir "$UPLOAD_STAGING"
docker cp "$TMP_DIR/uploads/." "$CONTAINER_NAME:$UPLOAD_STAGING/"
docker exec "$CONTAINER_NAME" chown -R tuesday:tuesday "$UPLOAD_STAGING"

RESTORE_DB_CREATED=true
docker exec -u postgres "$CONTAINER_NAME" createdb -O tuesday "$RESTORE_DB"

docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 --single-transaction -U tuesday "$RESTORE_DB" < "$TMP_DIR/database.sql"

terminate_restore_connections
DB_SWAPPED=true
docker exec -u postgres "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -d postgres -c \
    "ALTER DATABASE tuesday RENAME TO $PREVIOUS_DB" >/dev/null
if ! docker exec -u postgres "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -d postgres -c \
    "ALTER DATABASE $RESTORE_DB RENAME TO tuesday" >/dev/null; then
    exit 1
fi

UPLOAD_HAD_PREVIOUS=$(docker exec "$CONTAINER_NAME" sh -eu -c '
    if [ -e /app/data/uploads ]; then printf true; else printf false; fi
')
UPLOAD_SWAP_STARTED=true
docker exec "$CONTAINER_NAME" sh -eu -c '
    staging="$1"
    previous="$2"
    if [ -e /app/data/uploads ]; then
        mv /app/data/uploads "$previous"
    fi
    mv "$staging" /app/data/uploads
' sh "$UPLOAD_STAGING" "$UPLOAD_PREVIOUS"

APP_RUNNING=true
docker exec "$CONTAINER_NAME" supervisorctl start tuesday >/dev/null
if ! wait_until_ready; then
    echo "ERROR: restored Tuesday instance did not become ready; rolling back." >&2
    exit 1
fi

RESTORE_COMMITTED=true
RESTART_SAFE=true
DB_SWAPPED=false
RESTORE_DB_CREATED=false
UPLOAD_SWAP_STARTED=false
UPLOAD_STAGING_CREATED=false
APP_STOPPED=false

docker exec -u postgres "$CONTAINER_NAME" dropdb --if-exists "$PREVIOUS_DB" >/dev/null 2>&1 || \
    echo "WARNING: restored database is active, but $PREVIOUS_DB could not be removed." >&2
docker exec "$CONTAINER_NAME" rm -rf "$UPLOAD_PREVIOUS" >/dev/null 2>&1 || \
    echo "WARNING: restored uploads are active, but $UPLOAD_PREVIOUS could not be removed." >&2

echo "Restore complete!"
