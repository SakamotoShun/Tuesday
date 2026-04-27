# Backup & Restore

## Overview

Tuesday stores all data in two locations within the `/app/data` Docker volume:

- **PostgreSQL database** — All structured data (users, projects, tasks, docs, chat, etc.)
- **Uploaded files** — Attachments and avatars in `/app/data/uploads/`

A complete backup requires both the database dump and the uploads directory.

Backups are created as a single archive containing both the PostgreSQL dump and the current uploads snapshot. This is a best-effort hot backup: the database dump is captured first, then the uploads directory is copied. That ordering favors consistency for referenced files and may leave behind harmless orphaned uploads created during the backup window.

## Database Backup

### Using the Backup Script

```bash
./scripts/backup.sh
```

This creates a compressed archive in `./backups/`:

```
backups/tuesday_backup_20260101_120000.tar.gz
```

Optional environment variables:

```bash
KEEP_LAST_N=14 ./scripts/backup.sh
BACKUP_UPLOAD_CMD='rclone copy "$BACKUP_FILE_PATH" remote:tuesday/' ./scripts/backup.sh
```

### Manual Backup

```bash
docker exec tuesday pg_dump --clean --if-exists --no-owner --no-privileges -U tuesday tuesday > database.sql
docker cp tuesday:/app/data/uploads ./uploads
tar -czf tuesday_backup_manual.tar.gz database.sql uploads
```

### Automated Backups

Add a cron job for scheduled backups:

```bash
# Daily backup at 2 AM
0 2 * * * /path/to/tuesday/scripts/backup.sh
```

The script already keeps the newest 14 archives by default. To override that behavior:

```bash
# Keep the newest 30 archives instead
KEEP_LAST_N=30 /path/to/tuesday/scripts/backup.sh
```

## Backup Verification

Test the newest archive (or pass an explicit archive path):

```bash
./scripts/backup-verify.sh
./scripts/backup-verify.sh backups/tuesday_backup_20260101_120000.tar.gz
```

The verification script restores the database into a temporary PostgreSQL container and checks that the uploads snapshot is present.

## Restore

### Using the Restore Script

```bash
./scripts/restore.sh backups/tuesday_backup_20260101_120000.tar.gz
```

Skip the confirmation prompt when running in automation:

```bash
./scripts/restore.sh --yes backups/tuesday_backup_20260101_120000.tar.gz
```

The script will:
1. Validate the backup file exists
2. Ask for confirmation before overwriting
3. Restore the database from the backup
4. Replace `/app/data/uploads` with the archived uploads snapshot when restoring from `.tar.gz`

### Manual Restore

```bash
# Extract the archive first
tar -xzf tuesday_backup_manual.tar.gz

# Restore the database
cat database.sql | docker exec -i tuesday psql -U tuesday tuesday

# Restore uploads
docker exec tuesday sh -c 'rm -rf /app/data/uploads && mkdir -p /app/data/uploads'
docker cp ./uploads/. tuesday:/app/data/uploads/
```

## Disaster Recovery

Full recovery procedure:

1. Start a fresh Tuesday container:

   ```bash
   docker compose up -d
   ```

2. Wait for PostgreSQL to initialize (check with `docker compose logs -f`)

3. Restore the database:

   ```bash
   ./scripts/restore.sh backups/tuesday_backup_<timestamp>.tar.gz
   ```

4. Verify everything works by logging in and checking data.

## Best Practices

- **Test restores regularly** — A backup is only useful if you can restore from it.
- **Store backups off-site** — Copy backups to a different machine or cloud storage.
- **Automate backups** — Use cron jobs or your infrastructure's backup system.
- **Back up before upgrades** — Always create a backup before upgrading Tuesday.
- **Monitor backup size** — Database and file backups will grow over time.
- **Run `backup-verify.sh` regularly** — especially before upgrades or infrastructure moves.
