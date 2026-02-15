# GEMINI.md - Quasrr Project Context

This file provides the essential context and instructions for AI agents working on the Quasrr codebase.

## Project Overview
Quasrr is a unified media dashboard that combines **Sonarr** (TV), **Radarr** (Movies), **SABnzbd** (Downloads), and **Plex** (Summary metrics) into a single, mobile-first interface. It emphasizes a **manual-only workflow**, **streaming-first discovery**, and **AI-assisted release selection**.

### Core Philosophy
- **Intentionality:** No automated background monitoring/downloads. Every action is user-initiated.
- **Streaming-First:** Checks TMDB for availability on user-subscribed streaming services before offering downloads.
- **Practical Quality:** Prefers realistic file sizes (e.g., 720p WEBDL) over maximum quality for casual viewing.
- **Mobile-Optimized:** Designed primarily for touch interfaces with a "Nebula" glass-inspired aesthetic.

## Tech Stack
- **Backend:** FastAPI (Python 3.11+), Pydantic v2, httpx (async), aiosqlite, PyYAML.
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS.
- **Infrastructure:** Docker, Docker Compose.
- **Integrations:** Sonarr API v3, Radarr API v3, SABnzbd API, TMDB API v3, AI Providers (OpenAI, Anthropic, Gemini, Ollama, etc.).

## Architecture
The system consists of two main services coordinated via Docker Compose:
1.  **Backend (Port 8000):** An async FastAPI application that acts as a middleware aggregator. It handles authentication, configuration management, and communicates with media management tools and external APIs.
2.  **Frontend (Port 3000):** A Next.js application that provides the user interface. It communicates exclusively with the Quasrr backend.

### Key Data Flows
1.  **Stage 1 Search (Discovery):** Frontend -> Backend -> Radarr/Sonarr (library status) + TMDB (metadata/availability).
2.  **Stage 2 Search (Releases):** Frontend -> Backend -> Radarr/Sonarr (indexer search) -> Results sorted/filtered by Backend -> AI Suggestion (Optional).
3.  **Download:** Frontend -> Backend -> Radarr/Sonarr -> SABnzbd.

## Building and Running

### Local Development
**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Docker (Testing & Service Management)
**DO NOT use direct `docker` or `docker compose` commands.** This environment requires a wrapper script to handle path translations and environment injection.

Always use the `dev-compose.sh` wrapper script:
```bash
# Path to wrapper
/mnt/nas_z/live/~docs/scripts/dev-compose.sh [project] <command>

# Start all services (background)
/mnt/nas_z/live/~docs/scripts/dev-compose.sh up -d

# Quick rebuild and start (recommended for code changes)
/mnt/nas_z/live/~docs/scripts/dev-compose.sh ub

# Rebuild only backend (FAST: ~10s)
/mnt/nas_z/live/~docs/scripts/dev-compose.sh up -d --build backend

# Rebuild only frontend (MODERATE: ~60-120s)
/mnt/nas_z/live/~docs/scripts/dev-compose.sh up -d --build frontend

# View logs
/mnt/nas_z/live/~docs/scripts/dev-compose.sh l

# Check service status
/mnt/nas_z/live/~docs/scripts/dev-compose.sh p
```
Refer to `reference/_AGENT_TESTING.md` for the full list of shorthand aliases and best practices.

## Development Conventions

### Backend
- **Async Everything:** All integration clients and route handlers must use `async/await`.
- **Configuration:** Follow the three-tier hierarchy: `.env` (secrets) > `config/settings.yaml` (user prefs) > `config/defaults.yaml` (system defaults).
- **Authentication:** Routes requiring auth should use the `protected_get`, `protected_post`, etc., decorators or include `Depends(verify_token)`.
- **Validation:** Use Pydantic models for all request bodies and complex response structures.

### Frontend
- **Type Safety:** All API responses and shared state must be typed in `src/types/index.ts`.
- **Hooks:** Use custom hooks (e.g., `useSabPolling`, `useReleaseData`) to encapsulate API logic and polling.
- **Styling:** Follow the established Tailwind patterns (glass-morphism, dark-mode centric, mobile-first responsive design).
- **Components:** Reusable UI components belong in `src/components/`. Use the `DetailModal` for consistent media viewing.

### Testing
- **Health Checks:** Container reliability is managed via health check endpoints (`/health` on backend, `/` on frontend).
- **Integration Status:** The `/integrations/status` endpoint provides real-time health of connected services.

## Key Files & Directories
- `backend/main.py`: API entry point and route definitions.
- `backend/config.py`: Core configuration and environment logic.
- `backend/integrations/`: Dedicated clients for external services.
- `frontend/src/app/`: Next.js App Router structure (discovery, library, settings, etc.).
- `frontend/src/types/index.ts`: Centralized TypeScript definitions.
- `config/defaults.yaml`: Defines the default behavior, quality thresholds, and red flags.
- `reference/`: Contains architectural notes, agents' guidelines, and refactoring plans.

## Safety & Security
- **No Secrets:** Never commit `.env` or `config/settings.yaml`.
- **Redaction:** Use the `redact_secrets` utility in `config.py` when returning configuration data to the frontend.
- **User Control:** Always ensure that destructive actions (delete, grab) originate from an explicit user request.
