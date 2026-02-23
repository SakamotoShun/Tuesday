# Deployment Guide

This guide covers deploying Tuesday using Docker.

## Prerequisites

- Docker 20.10+ and Docker Compose v2+
- At least 1 GB RAM and 2 GB disk space
- A domain name (optional, for HTTPS)

## Quick Start

### Option 1: Pull from GitHub Container Registry (fastest)

```bash
docker run -d \
  --name tuesday \
  -p 7002:8080 \
  -v tuesday_data:/app/data \
  --restart unless-stopped \
  ghcr.io/sakamotoshun/tuesday:latest
```

### Option 2: Build from source

```bash
# Clone the repository
git clone https://github.com/your-org/tuesday.git
cd tuesday

# Build and start
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

Tuesday will be available at `http://localhost:7002`. On first visit you will see the setup wizard to create your admin account.

## GitHub Container Registry (GHCR)

Pre-built images are available on GHCR:

- `ghcr.io/sakamotoshun/tuesday:latest` — Latest release
- `ghcr.io/sakamotoshun/tuesday:1.2.0` — Pinned version

```bash
# Pull a specific version
docker pull ghcr.io/sakamotoshun/tuesday:1.2.0
```

## Building the Image

If you prefer to build locally:

```bash
# Build locally
docker build -t tuesday:latest .

# Or build via compose
docker compose build
```

The multi-stage build:
1. Builds the React frontend with Vite
2. Installs backend production dependencies
3. Creates an Ubuntu-based image with PostgreSQL 16, supervisord, and Bun

## Running the Container

### With Docker Compose (recommended)

```bash
docker compose up -d
```

### With Docker Run

```bash
docker run -d \
  --name tuesday \
  -p 7002:8080 \
  -v tuesday_data:/app/data \
  --restart unless-stopped \
  ghcr.io/sakamotoshun/tuesday:latest
```

### Environment Variables

Pass environment variables via `.env` file or `docker compose` environment section:

```bash
cp .env.example .env
# Edit .env as needed
docker compose up -d
```

See [Configuration Reference](./configuration.md) for all available options.

## Automatic Updates (Watchtower)

[Watchtower](https://github.com/nicholas-fedor/watchtower) can automatically pull new Tuesday images and restart the container when updates are available.

### Docker CLI

```bash
docker run -d \
  --name watchtower \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  nickfedor/watchtower tuesday
```

By default, Watchtower checks for updates every 24 hours. To check more frequently, set an interval in seconds:

```bash
docker run -d \
  --name watchtower \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  nickfedor/watchtower --interval 300 tuesday
```

### Docker Compose

The included `docker-compose.yml` already defines a `watchtower` service that monitors only the `tuesday` container.

```bash
docker compose up -d
```

### Port Safety

Watchtower does not publish any host ports in this setup. Even though the Watchtower container exposes `8080/tcp` internally, it does not conflict with Tuesday's `7002:8080` mapping.

## Data Persistence

All persistent data is stored in the `/app/data` Docker volume:

```
/app/data/
├── postgres/          # PostgreSQL data directory
├── uploads/           # User file uploads
└── .session_secret    # Auto-generated session signing key
```

**Important:** Always use a named volume or bind mount for `/app/data` to preserve data across container restarts and upgrades.

## Health Check

The container includes a built-in health check:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' tuesday

# Manual health check
curl http://localhost:7002/health
```

## Reverse Proxy Setup

Tuesday listens on port 8080 internally. Use a reverse proxy for HTTPS termination.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tuesday.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:7002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # File upload size limit
    client_max_body_size 10m;
}

# HTTP redirect
server {
    listen 80;
    server_name tuesday.example.com;
    return 301 https://$host$request_uri;
}
```

### Caddy

```
tuesday.example.com {
    reverse_proxy localhost:7002
}
```

Caddy handles HTTPS certificates automatically via Let's Encrypt.

### Nginx Proxy Manager

1. Add a new proxy host
2. Set the forward hostname to `localhost` (or the Docker host IP) and port `7002`
3. Enable "Websockets Support"
4. Configure SSL via Let's Encrypt on the SSL tab

## Logging

Both PostgreSQL and the Tuesday server log to stdout/stderr, which Docker captures:

```bash
# View all logs
docker compose logs -f

# View only the last 100 lines
docker compose logs --tail 100

# View logs since a timestamp
docker compose logs --since 2025-01-01T00:00:00
```

## Stopping and Restarting

```bash
# Stop
docker compose down

# Restart
docker compose restart

# Stop and remove volumes (DESTROYS ALL DATA)
docker compose down -v
```

## Troubleshooting

### Container won't start

Check the logs for errors:

```bash
docker compose logs --tail 50
```

Common issues:
- **Port conflict**: Another service is using port 7002 (or your configured host port). Change `TUESDAY_PORT` in `.env`.
- **Insufficient permissions**: The data volume must be writable.

### Database connection errors

PostgreSQL starts before the app server. If the app can't connect, check PostgreSQL logs:

```bash
docker compose logs | grep postgresql
```

### WebSocket not connecting

Ensure your reverse proxy passes WebSocket headers (`Upgrade` and `Connection`). See the Nginx example above.

### Reset to fresh state

```bash
docker compose down -v
docker compose up -d
```

This removes all data and starts fresh with the setup wizard.
