# Backup & Restore

## Overview

Tuesday stores all data in two locations within the `/app/data` Docker volume:

- **PostgreSQL database** — All structured data (users, projects, tasks, docs, chat, etc.)
- **Uploaded files** — Attachments and avatars in `/app/data/uploads/`

A complete backup requires both the database dump and the uploads directory.

## Database Backup

### Using the Backup Script

```bash
./scripts/backup.sh
```

This creates a compressed backup in `./backups/`:

```
backups/tuesday_backup_20260101_120000.sql.gz
```

### Manual Backup

```bash
docker exec tuesday pg_dump -U tuesday tuesday > backup.sql
gzip backup.sql
```

### Automated Backups

Add a cron job for scheduled backups:

```bash
# Daily backup at 2 AM
0 2 * * * /path/to/tuesday/scripts/backup.sh
```

Consider adding cleanup for old backups:

```bash
# Keep only the last 30 days of backups
find /path/to/tuesday/backups -name "*.sql.gz" -mtime +30 -delete
```

## File Backup

Back up uploaded files separately:

```bash
# Copy uploads from the Docker volume
docker cp tuesday:/app/data/uploads ./backups/uploads_$(date +%Y%m%d)
```

Or if using a bind mount:

```bash
cp -r /path/to/data/uploads ./backups/uploads_$(date +%Y%m%d)
```

## Restore

### Using the Restore Script

```bash
./scripts/restore.sh backups/tuesday_backup_20260101_120000.sql.gz
```

The script will:
1. Validate the backup file exists
2. Ask for confirmation before overwriting
3. Restore the database from the backup

### Manual Restore

```bash
# From compressed backup
gunzip -c backup.sql.gz | docker exec -i tuesday psql -U tuesday tuesday

# From uncompressed backup
cat backup.sql | docker exec -i tuesday psql -U tuesday tuesday
```

### Restoring Files

```bash
# Copy uploads back into the container
docker cp ./backups/uploads_20260101/. tuesday:/app/data/uploads/
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
   ./scripts/restore.sh backups/tuesday_backup_<timestamp>.sql.gz
   ```

4. Restore uploaded files:

   ```bash
   docker cp ./backups/uploads_<date>/. tuesday:/app/data/uploads/
   ```

5. Verify everything works by logging in and checking data.

## Best Practices

- **Test restores regularly** — A backup is only useful if you can restore from it.
- **Store backups off-site** — Copy backups to a different machine or cloud storage.
- **Automate backups** — Use cron jobs or your infrastructure's backup system.
- **Back up before upgrades** — Always create a backup before upgrading Tuesday.
- **Monitor backup size** — Database and file backups will grow over time.
