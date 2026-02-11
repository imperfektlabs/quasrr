# Agent Testing Guide

**READ THIS FIRST before running any Docker commands in this project!**

This document explains the proper workflow for AI agents working on this project. Following these guidelines will prevent errors and save time.

---

## 🚫 DO NOT Use Direct Docker Commands

**Never run these commands directly:**
```bash
# ❌ WRONG - Will fail with path/permission issues
docker compose up -d --build
docker compose down
docker-compose up -d
```

These commands fail because the compose file expects NAS-canonical paths (`/share/DockerStacks/live/...`) but you're in a local development environment (`/mnt/nas_z/live/...`).

---

## ✅ Use the dev-compose.sh Script Instead

**Always use the wrapper script:**
```bash
/mnt/nas_z/live/docs/scripts/dev-compose.sh [project] <command>
```

The script handles:
- Path translation (local → NAS paths)
- Project name detection
- Correct environment variable injection

---

## Common Workflows

### From the Project Directory (e.g., `/mnt/nas_z/live/barney`)

```bash
# Start services
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d

# Rebuild and restart (code changes)
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d --build

# Rebuild specific service only
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d --build backend

# Stop and remove containers
/mnt/nas_z/live/docs/scripts/dev-compose.sh down

# View logs
/mnt/nas_z/live/docs/scripts/dev-compose.sh logs -f

# Check service status
/mnt/nas_z/live/docs/scripts/dev-compose.sh ps
```

### From Any Location

Specify the project name as the first argument:

```bash
/mnt/nas_z/live/docs/scripts/dev-compose.sh barney up -d --build
/mnt/nas_z/live/docs/scripts/dev-compose.sh quasrr up -d --build backend
```

---

## Shorthand Aliases

The script provides convenient shortcuts:

| Alias | Expands To | Description |
|-------|-----------|-------------|
| `u` | `up -d` | Start services in background |
| `ub` | `up -d --build` | Rebuild and start (fast for code changes) |
| `du` | `down && up -d --build` | Full teardown and rebuild (slower) |
| `d` | `down` | Stop and remove containers |
| `p` | `ps` | Show service status |
| `l` | `logs -f --tail=100` | Follow recent logs |
| `b` | `build --remove-orphans` | Build only (don't start) |
| `rb` | `build --no-cache` | Full rebuild without cache |

### Examples:

```bash
# Quick rebuild and start (recommended for code changes)
/mnt/nas_z/live/docs/scripts/dev-compose.sh ub

# Full teardown and rebuild
/mnt/nas_z/live/docs/scripts/dev-compose.sh du

# Check logs
/mnt/nas_z/live/docs/scripts/dev-compose.sh l
```

---

## Expected Rebuild Times

Understanding rebuild times helps set accurate expectations:

### Backend-Only Changes (Python/FastAPI)
```bash
# Fast rebuild: ~5-10 seconds
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d --build backend
```
- Uses Docker layer caching
- Only copies changed Python files
- Reuses pip dependencies cache

### Frontend-Only Changes (React/Vite or Next.js)
```bash
# Moderate rebuild: ~30-90 seconds
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d --build frontend
```
- Depends on app size and complexity
- React/Vite: ~30-60 seconds
- Next.js: ~60-120 seconds

### Full Stack Rebuild
```bash
# Slow rebuild: ~1-3 minutes
/mnt/nas_z/live/docs/scripts/dev-compose.sh ub
# or
/mnt/nas_z/live/docs/scripts/dev-compose.sh du
```
- Rebuilds both backend and frontend
- Use only when both changed or when troubleshooting

---

## Best Practices for Agents

### 1. Rebuild Only What Changed

```bash
# If you only modified backend Python files:
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d --build backend

# If you only modified frontend code:
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d --build frontend
```

This is **significantly faster** than rebuilding everything.

### 2. Use `ub` Instead of `du` for Code Changes

```bash
# ✅ FAST: Rebuild with cache (~10-60 seconds)
/mnt/nas_z/live/docs/scripts/dev-compose.sh ub

# ❌ SLOW: Full teardown and rebuild (~1-3 minutes)
/mnt/nas_z/live/docs/scripts/dev-compose.sh du
```

Only use `du` when:
- Debugging weird container state issues
- Changed `compose.yml` configuration
- Explicitly requested by the user

### 3. Tell Users Realistic Wait Times

Based on what you're rebuilding:
- Backend only: "Rebuilding backend, should be ready in ~10 seconds"
- Frontend only: "Rebuilding frontend, should be ready in ~30-60 seconds"
- Both services: "Rebuilding both services, this will take ~1-2 minutes"
- Full rebuild with `du`: "Full rebuild in progress, this will take ~2-3 minutes"

### 4. Check Service Status After Rebuild

```bash
# Verify services are running
/mnt/nas_z/live/docs/scripts/dev-compose.sh ps

# Check logs for errors
/mnt/nas_z/live/docs/scripts/dev-compose.sh l backend
```

### 5. Handle Errors Gracefully

If a rebuild fails:
1. Check the logs: `/mnt/nas_z/live/docs/scripts/dev-compose.sh l`
2. Identify the failing service (backend vs frontend)
3. Fix the issue in the code
4. Rebuild only that service: `dev-compose.sh up -d --build <service>`

**Don't immediately jump to `du` or destructive commands** - investigate first!

---

## Project-Specific Notes

### Barney (Finance Stack)
- **Backend:** Python/FastAPI (fast rebuilds)
- **Frontend:** React + Vite (moderate rebuilds)
- **Database:** SQLite (persisted in `/data/db/`)
- After backend changes: `dev-compose.sh up -d --build backend` (~10 sec)

### Quasrr (Media Stack)
- **Backend:** Python/FastAPI (fast rebuilds)
- **Frontend:** Next.js (slower rebuilds ~60-120 sec)
- After backend changes: `dev-compose.sh up -d --build backend` (~10 sec)
- After frontend changes: `dev-compose.sh up -d --build frontend` (~60-90 sec)

---

## Troubleshooting

### "Stack directory not found"
- Make sure you're in the project directory, or specify the project name:
  ```bash
  /mnt/nas_z/live/docs/scripts/dev-compose.sh barney up -d
  ```

### "No compose file found"
- The project must have a `compose.yml` or `docker-compose.yml` file
- Check that you're in the right directory

### Services won't start
1. Check logs: `dev-compose.sh l`
2. Check status: `dev-compose.sh p`
3. Try a clean restart: `dev-compose.sh d && dev-compose.sh u`
4. Last resort: `dev-compose.sh du` (full rebuild)

### Changes not appearing
- Did you rebuild? `dev-compose.sh ub`
- Check which service changed and rebuild it specifically
- For Python: Make sure you rebuilt backend
- For JS/TS: Make sure you rebuilt frontend

---

## Summary

**Quick Reference Card:**

```bash
# Navigate to project
cd /mnt/nas_z/live/barney

# Code change workflow (FAST)
# 1. Edit code
# 2. Rebuild only what changed:
/mnt/nas_z/live/docs/scripts/dev-compose.sh up -d --build backend
# 3. Wait 5-10 seconds
# 4. Test changes

# Full rebuild (SLOW - only when needed)
/mnt/nas_z/live/docs/scripts/dev-compose.sh du
# Wait 2-3 minutes

# View status and logs
/mnt/nas_z/live/docs/scripts/dev-compose.sh p
/mnt/nas_z/live/docs/scripts/dev-compose.sh l
```

---

**Remember:** Using the `dev-compose.sh` script is not optional - it's required for this development environment to work correctly. Always use the script, never direct docker commands.
