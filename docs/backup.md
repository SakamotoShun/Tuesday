# Backup & Restore

## Overview

Tuesday stores all data in two locations within the `/app/data` Docker volume:

- **PostgreSQL database** — All structured data (users, projects, tasks, docs, chat, etc.)
- **Uploaded files** — Attachments and avatars in `/app/data/uploads/`

A complete backup requires both the database dump and the uploads directory.

Backups are created as a single archive containing both the PostgreSQL dump and uploads snapshot. The script stops the Tuesday application while PostgreSQL remains available, preventing application mutations while both parts are captured. Tuesday is restarted and checked through `/ready` before compression or off-site upload. An application that was already stopped remains stopped. The maintenance lock is released when the script finishes.

These scripts support the packaged embedded PostgreSQL and `/app/data/uploads` layout, not external databases or custom upload paths. Do not restart the container, start Tuesday manually, or write directly to the database or uploads during backup or restore. The maintenance lock serialises these scripts; it does not prevent manual operations or container restarts.

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

`BACKUP_UPLOAD_CMD` is operator-controlled and interpreted by the shell unless it points to an executable file, so quote any embedded paths or secrets carefully.

### Manual Backup

Do not assemble backup archives manually. Restore accepts the versioned full-snapshot format produced by `scripts/backup.sh`, including `database.sql`, `uploads/`, and `metadata.env`. Only restore trusted archives: the SQL is executed against PostgreSQL. Older scripts also produced backup-v2 archives but captured them while Tuesday was running; metadata validation alone cannot establish their database/upload consistency.

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

This checks SQL import and archive structure, not every database file reference or application behaviour. A successful application restore and representative file checks are still required before treating a backup as recovery-tested.

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
3. Restore into a staging database and stage archived uploads
4. Swap the staged snapshot into place while retaining the previous state
5. Start Tuesday and require `/ready` to pass before discarding the previous state
6. Roll back both database and uploads if validation fails

If Tuesday cannot be stopped during rollback, the script leaves both snapshots and the maintenance lock in place instead of replacing live data. Do not delete the lock or rerun restore until an operator has stopped Tuesday and reconciled the retained databases and upload directories. Container termination, host failure, and forced process kills require manual recovery; the shell trap cannot recover from those events.

### Manual Restore

Do not apply `database.sql` or replace `/app/data/uploads` manually. Direct restoration can leave the database and files at different snapshot points or make rollback impossible after a partial failure. Use `scripts/restore.sh` for both routine restore and disaster recovery.

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
