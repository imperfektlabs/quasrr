# Docker Configuration Standards

## Container Architecture
- **Backend**: Python FastAPI service
- **Frontend**: Next.js (Node.js)
- **Database**: SQLite (volume mount, no separate container)

## Port Standards
- Frontend: `3000` (configurable via env)
- Backend: `8000` (configurable via env)
- Health endpoints must be exposed

## Volume Mounts
```yaml
volumes:
  - ./data:/app/data          # SQLite database + user data
  - ./config:/app/config      # Configuration files
  - ./logs:/app/logs          # Application logs (optional)
```

## Environment Variables
Required:
- `RADARR_URL`, `RADARR_API_KEY`
- `SONARR_URL`, `SONARR_API_KEY`
- `SABNZBD_URL`, `SABNZBD_API_KEY`
- `AI_PROVIDER` (openai|anthropic|ollama)
- `AI_API_KEY` (if not using local model)
- `USER_COUNTRY` (default: CA)

Optional:
- `LOG_LEVEL` (default: INFO)
- `FRONTEND_PORT` (default: 3000)
- `BACKEND_PORT` (default: 8000)

## Network Configuration
- Use `bridge` network by default
- Tailscale: Host network mode for Tailscale subnet access
- No external ingress required (internal-only design)

## Health Checks
All containers must have:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:PORT/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Build Standards
- Multi-stage builds to minimize image size
- Non-root user inside containers
- Clear labeling (version, description, maintainer)
- `.dockerignore` to exclude dev files

## Docker Compose Structure
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    # ... config
  
  frontend:
    build: ./frontend
    depends_on:
      - backend
    # ... config
```

## Data Persistence
- SQLite database MUST survive container restarts
- User config MUST be editable without rebuilding
- Logs optional (can be ephemeral or mounted)