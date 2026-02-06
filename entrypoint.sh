#!/bin/bash
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
PG_DATA="$DATA_DIR/postgres"

# Initialize PostgreSQL if needed
if [ ! -d "$PG_DATA" ]; then
    echo "Initializing PostgreSQL..."
    mkdir -p "$PG_DATA"
    chown postgres:postgres "$PG_DATA"
    su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PG_DATA"

    # Configure PostgreSQL for local connections only
    echo "host all all 127.0.0.1/32 trust" >> "$PG_DATA/pg_hba.conf"
    echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"

    # Start PostgreSQL temporarily to create database and user
    su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w start"
    su postgres -c "createuser tuesday"
    su postgres -c "createdb -O tuesday tuesday"
    su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w stop"
fi

# Ensure correct ownership after any volume mount changes
chown -R postgres:postgres "$PG_DATA"

# Generate session secret if not already set or stored
SECRET_FILE="$DATA_DIR/.session_secret"
if [ -z "$SESSION_SECRET" ]; then
    if [ ! -f "$SECRET_FILE" ]; then
        echo "Generating session secret..."
        openssl rand -base64 32 > "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
    fi
    export SESSION_SECRET=$(cat "$SECRET_FILE")
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://tuesday:tuesday@localhost:5432/tuesday}"

# Create uploads directory if it doesn't exist
mkdir -p "$DATA_DIR/uploads"

echo "Starting Tuesday..."

# Execute CMD (supervisord)
exec "$@"
