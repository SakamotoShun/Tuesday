# Upgrade Guide

## Standard Upgrade

This section is for source builds with `TUESDAY_IMAGE` unset. Keep a maintenance window in place until the new version passes verification. If this deployment previously used the bundled Watchtower container, stop and remove it **before** taking the backup; removing its Compose definition does not stop an existing updater:

```bash
docker stop watchtower
docker rm watchtower
```

1. **Back up your data** before upgrading:

   ```bash
   ./scripts/backup.sh
   ./scripts/backup-verify.sh
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

### Published Compose images

For a deployment with `TUESDAY_IMAGE` set to a release digest, take and verify the backup as above, update that variable to the target digest, then run:

```bash
docker compose pull tuesday
docker compose up -d --no-build --pull never tuesday
docker compose ps
docker compose logs --tail 20 tuesday
```

Do not run `docker compose build` with a digest-valued `TUESDAY_IMAGE`; a digest is not a valid build tag. Retain the previous image digest with the verified pre-upgrade snapshot for rollback.

## Post-Upgrade Maintenance

If you are upgrading from a version before global doc-content search was introduced, run the search index backfill once after upgrade:

```bash
docker exec -it tuesday sh -lc 'cd /app/backend && bun run search:backfill-docs'
```

This rebuilds `docs.search_text` from both stored doc JSON and collaborative Yjs history, so existing documents are searchable by body text.

## Docker Run Upgrade

If you deployed with `docker run`, follow the same upgrade flow but replace the `docker compose` steps with these commands:

1. **Back up your data** before upgrading:

   ```bash
   ./scripts/backup.sh
   ./scripts/backup-verify.sh
   ```

2. **Pull the target immutable version**:

   ```bash
   docker pull ghcr.io/sakamotoshun/tuesday:1.2.0
   ```

3. **Stop and remove the old container**:

   ```bash
   docker stop -t 120 tuesday
   docker rm tuesday
   ```

4. **Run the new container** with the same ports, env vars, and volume:

   ```bash
   docker run -d \
     --name tuesday \
     -p 7002:8080 \
     -v tuesday_data:/app/data \
     -e TUESDAY_BASE_URL=http://localhost:7002 \
     -e CORS_ORIGIN=http://localhost:7002 \
     --stop-timeout 120 \
     --restart unless-stopped \
     ghcr.io/sakamotoshun/tuesday:1.2.0
   ```

5. **Verify** the container is healthy:

   ```bash
   docker logs --tail 20 tuesday
   ```

Database migrations run automatically on startup. The application will not start until all migrations have been applied.

## Automatic Upgrades

Do not use Watchtower for Tuesday. Automatic replacement can run forward-only migrations without a verified backup or a compatible rollback image. Follow the explicit upgrade procedure above with an immutable image reference.

## Rollback

If something goes wrong after an upgrade:

Keep user traffic blocked throughout rollback. Restoring a pre-upgrade backup discards changes made after that backup. Preserve any newer data needed for reconciliation before proceeding. The commands below apply to source builds; published-image deployments must use their retained previous image digest instead of rebuilding.

1. **Preserve the restore tool and Supervisor configuration, then stop the container**:

   ```bash
   cp ./scripts/restore.sh /tmp/tuesday-restore.sh
   cp ./supervisord.conf /tmp/tuesday-supervisord.conf
   chmod +x /tmp/tuesday-restore.sh
   docker compose down
   ```

2. **Check out the previous version**:

   ```bash
   git checkout <previous-tag-or-commit>
   ```

3. **Rebuild and restore**:

   ```bash
   cp /tmp/tuesday-supervisord.conf ./supervisord.conf
   docker compose build
   docker compose up -d tuesday
   /tmp/tuesday-restore.sh backups/tuesday_backup_<timestamp>.tar.gz
   ```

Copying the restore tool before checkout keeps the current staging, rollback, and readiness safeguards. The current Supervisor configuration supplies the control socket required by that tool. Start only the Tuesday service so an older Compose file does not re-enable Watchtower. The standard `.tar.gz` backup contains both the database and uploads; use it to restore them together. Rolling back after a database migration requires restoring a pre-upgrade backup because migrations are forward-only.

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
