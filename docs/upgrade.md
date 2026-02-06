# Upgrade Guide

## Standard Upgrade

1. **Back up your data** before upgrading:

   ```bash
   ./scripts/backup.sh
   ```

2. **Pull the latest code** (or image):

   ```bash
   git pull origin master
   ```

3. **Rebuild and restart**:

   ```bash
   docker compose build
   docker compose up -d
   ```

4. **Verify** the container is healthy:

   ```bash
   docker compose ps
   docker compose logs --tail 20
   ```

Database migrations run automatically on startup. The application will not start until all migrations have been applied.

## Docker Run Upgrade

If you deployed with `docker run`, follow the same upgrade flow but replace the `docker compose` steps with these commands:

1. **Back up your data** before upgrading:

   ```bash
   ./scripts/backup.sh
   ```

2. **Pull the latest image** (or a specific version tag):

   ```bash
   docker pull sohshunhong/tuesday:latest
   ```

3. **Stop and remove the old container**:

   ```bash
   docker stop tuesday
   docker rm tuesday
   ```

4. **Run the new container** with the same ports, env vars, and volume:

   ```bash
   docker run -d \
     --name tuesday \
     -p 8080:8080 \
     -v tuesday_data:/app/data \
     --restart unless-stopped \
     sohshunhong/tuesday:latest
   ```

5. **Verify** the container is healthy:

   ```bash
   docker logs --tail 20 tuesday
   ```

Database migrations run automatically on startup. The application will not start until all migrations have been applied.

## Rollback

If something goes wrong after an upgrade:

1. **Stop the container**:

   ```bash
   docker compose down
   ```

2. **Check out the previous version**:

   ```bash
   git checkout <previous-tag-or-commit>
   ```

3. **Rebuild and restore**:

   ```bash
   docker compose build
   docker compose up -d
   ./scripts/restore.sh backups/tuesday_backup_<timestamp>.sql.gz
   ```

**Note:** Rolling back after a database migration may require restoring from backup, since migrations are forward-only.

## Version Compatibility

- Tuesday uses sequential SQL migrations (`0001_initial.sql`, `0002_docs.sql`, etc.)
- Each migration is tracked in the `drizzle_migrations` table
- Migrations are idempotent: re-running them on an already-migrated database is safe
- The application checks and applies any pending migrations on every startup

## Data Preservation

The following data is preserved across upgrades when using a Docker volume:

- PostgreSQL database (all projects, tasks, docs, chat history, etc.)
- Uploaded files
- Session secret
- User sessions (active logins)

## Checking Current Version

```bash
# View the running container's image
docker inspect --format='{{.Config.Image}}' tuesday

# View recent commits in the running code
docker exec tuesday cat /app/backend/package.json | grep version
```
