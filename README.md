# Quasrr

**Unified media search and download management for the casual viewer.**

Quasrr is a self-hosted, mobile-first web application that combines media discovery, streaming availability awareness, and manual download workflows into a single, clean interface. It's designed for users who want intentional, size-conscious downloads without the complexity of automated PVR systems.

---

## Table of Contents

- [Philosophy](#philosophy)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [API Integrations](#api-integrations)
- [Development Notes](#development-notes)
- [Quality Preferences](#quality-preferences)
- [Roadmap](#roadmap)

---

## Philosophy

Quasrr is built around these core principles:

- **Manual-only workflow** - No automatic downloads or background monitoring. Every download requires explicit user approval.
- **Streaming-first** - Check if content is available on your subscriptions before offering downloads.
- **Size-conscious quality** - Practical file sizes (800MB-1.2GB for TV episodes) over maximum quality.
- **AI-assisted, not automated** - AI suggests releases based on your preferences, but never downloads automatically.
- **Mobile-optimized** - Touch-friendly interface designed for phones and tablets.
- **Low-volume usage** - Built for casual, intentional viewing, not archival or library perfectionism.

---

## Features

### Current (v0.1.0)

✅ **Unified Search**
- Natural language search with AI intent parsing
- Automatic movie vs TV detection
- Search by ID (TMDB, TVDB, IMDB)
- Pagination and filtering (status, type, sort by relevance/year/rating/popularity)

✅ **Streaming Availability**
- Country-aware streaming detection (Canada-focused)
- Deep links to native streaming apps
- Configurable subscription list with visual logos
- Per-title availability checking via TMDB

✅ **Manual Download Workflow**
- Release search via Sonarr/Radarr indexers
- Group-based release organization (by release group, season, quality)
- Per-episode download tracking for TV shows
- Season progress indicators
- Quality filtering based on user preferences
- AI-powered release suggestions

✅ **Download Management**
- Unified SABnzbd queue visibility
- Pause/resume/delete individual jobs
- Pause/resume entire queue
- Recent download history (grouped by title)
- Auto-polling on Downloads tab

✅ **System Status**
- Integration health monitoring (Sonarr, Radarr, SABnzbd)
- Settings management (streaming services, country, AI model)
- Configuration reload endpoint

✅ **UI/UX**
- Nebula-inspired theme (cyan/fuchsia/violet palette)
- Mobile-first responsive design
- Glass-morphism effects
- Icon-based status indicators
- Animated gradient background
- Tool shortcuts with health-based greyscale

---

## Architecture

Quasrr uses a modern containerized architecture with separate frontend and backend services:

```
┌─────────────────┐
│   Frontend      │  Next.js 14 (React 18 + Tailwind CSS)
│   Port: 3000    │  Single-page app with client-side routing
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│   Backend       │  FastAPI (Python 3.11)
│   Port: 8000    │  Async API with health checks
└────────┬────────┘
         │
    ┌────┴────┬─────────┬──────────┬─────────┐
    ▼         ▼         ▼          ▼         ▼
┌────────┐ ┌──────┐ ┌────────┐ ┌──────┐ ┌──────┐
│ Sonarr │ │Radarr│ │SABnzbd │ │ TMDB │ │  AI  │
│  :8989 │ │:7878 │ │ :8080  │ │  API │ │ API  │
└────────┘ └──────┘ └────────┘ └──────┘ └──────┘
```

### Data Flow

1. **Search Phase**: User enters query → AI parses intent → Backend searches Sonarr/Radarr → TMDB checks streaming availability
2. **Release Phase**: User selects title → Backend triggers indexer search → Results grouped and sorted by size
3. **Download Phase**: User selects release → Backend sends to Sonarr/Radarr → Sonarr/Radarr sends to SABnzbd
4. **Monitoring Phase**: Frontend polls SABnzbd queue → Displays progress and status

---

## Tech Stack

### Backend
- **Python 3.11+** - Modern async/await support
- **FastAPI** - High-performance async web framework
- **Pydantic** - Data validation and serialization
- **httpx** - Async HTTP client for API integrations
- **aiosqlite** - Async SQLite database driver
- **PyYAML** - Configuration file parsing

### Frontend
- **Next.js 14** - React framework with App Router
- **React 18** - UI library with hooks and suspense
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **PWA Support** - Installable on mobile devices

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Multi-stage builds** - Optimized image sizes
- **Health checks** - Container reliability

---

## Project Structure

```
quasrr/
├── backend/                      # FastAPI backend service
│   ├── main.py                   # API routes and application entry (944 lines)
│   ├── config.py                 # Configuration management (276 lines)
│   ├── requirements.txt          # Python dependencies
│   ├── Dockerfile                # Backend container image
│   └── integrations/             # External service clients
│       ├── __init__.py
│       ├── ai.py                 # OpenAI/Anthropic/Ollama integration
│       ├── radarr.py             # Movie management API
│       ├── sonarr.py             # TV show management API
│       ├── sabnzbd.py            # Download client API
│       └── tmdb.py               # Streaming availability API
│
├── frontend/                     # Next.js frontend application
│   ├── src/
│   │   └── app/
│   │       ├── page.tsx          # Main SPA component (4076 lines) ⚠️
│   │       ├── layout.tsx        # Root layout with metadata
│   │       └── globals.css       # Global styles and theme
│   ├── public/                   # Static assets
│   │   └── logos/streaming/      # Streaming service logos (.svg)
│   ├── package.json              # npm dependencies
│   ├── Dockerfile                # Frontend container image
│   ├── next.config.js            # Next.js configuration
│   ├── tailwind.config.ts        # Tailwind CSS theme
│   └── tsconfig.json             # TypeScript configuration
│
├── config/                       # Application configuration
│   ├── defaults.yaml             # Default settings (shipped with app)
│   ├── settings.yaml             # User preferences (gitignored)
│   └── settings.example.yaml    # Example user settings
│
├── data/                         # SQLite database (gitignored)
│   └── quasrr.db
│
├── logs/                         # Application logs (gitignored)
│
├── reference/                    # Documentation and session logs
│   ├── PROJECT_BRIEF.md          # Project goals and philosophy
│   ├── TODOS.md                  # Feature tracking
│   ├── AGENTS.md                 # AI agent instructions
│   └── SESSION_LOG*.md           # Development session history
│
├── .env                          # Environment variables (gitignored)
├── compose.yml                   # Docker Compose orchestration
├── .gitignore                    # Git exclusions
└── README.md                     # This file
```

### ⚠️ Refactoring Note

The `frontend/src/app/page.tsx` file is currently **4076 lines** and contains:
- 30+ TypeScript type definitions
- Multiple utility functions and constants
- All UI components (search, results, releases, downloads, settings)
- State management logic
- API integration code

**Planned refactoring** will extract this into modular components:
- `types/` - Type definitions
- `utils/` - Helper functions and constants
- `hooks/` - Custom React hooks for API and state management
- `components/` - Reusable UI components organized by feature

---

## Configuration

Quasrr uses a three-tier configuration hierarchy (highest priority first):

1. **Environment variables** (`.env` file)
2. **User settings** (`config/settings.yaml`)
3. **Default settings** (`config/defaults.yaml`)

### Environment Variables (.env)

Required for service integrations:

```bash
# Sonarr (TV Shows)
SONARR_URL=http://your-nas-ip:8989
SONARR_API_KEY=your_api_key_here

# Radarr (Movies)
RADARR_URL=http://your-nas-ip:7878
RADARR_API_KEY=your_api_key_here

# SABnzbd (Download Client)
SABNZBD_URL=http://your-nas-ip:8080
SABNZBD_API_KEY=your_api_key_here

# TMDB (Streaming Availability)
TMDB_API_KEY=your_api_key_here

# AI Provider (OpenAI/Anthropic/Ollama)
AI_PROVIDER=openai
AI_MODEL=gpt-5-nano
AI_API_KEY=your_api_key_here

# User Preferences
USER_COUNTRY=CA
USER_LANGUAGE=en
LOG_LEVEL=INFO
```

### User Settings (config/settings.yaml)

```yaml
# Streaming services you subscribe to
streaming_services:
  - id: netflix
    name: Netflix
    enabled: true
  - id: crave
    name: Crave
    enabled: true
  - id: disney_plus
    name: Disney+
    enabled: true

# User preferences
user:
  country: CA

# AI configuration
ai:
  model: gpt-5-nano
```

### Default Settings (config/defaults.yaml)

Contains sensible defaults for quality preferences, feature flags, and streaming service definitions. See [config/defaults.yaml](config/defaults.yaml) for full details.

---

## Deployment

### Requirements

- Docker 20.10+
- Docker Compose 2.0+
- Sonarr instance (for TV shows)
- Radarr instance (for movies)
- SABnzbd instance (for downloads)
- TMDB API key (free, for streaming availability)
- OpenAI/Anthropic API key (for AI features)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd quasrr
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and service URLs
   ```

3. **Configure user settings**
   ```bash
   cp config/settings.example.yaml config/settings.yaml
   # Edit config/settings.yaml with your preferences
   ```

4. **Launch with Docker Compose**
   ```bash
   docker compose up -d
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### NAS Deployment (via SSH)

For deployment to a NAS (as used in development):

```bash
# From the docs/scripts/ directory
./nas.sh quasrr up-build    # Build and start containers
./smoke.sh quasrr --path /  # Wait for HTTP readiness
```

### Health Checks

Both services include health check endpoints:
- Backend: `http://localhost:8000/health`
- Frontend: `http://localhost:3000/`

Docker Compose will automatically restart unhealthy containers.

---

## API Integrations

### Sonarr (TV Shows)
- **Endpoint**: `/api/v3/`
- **Used for**: TV show search, indexer queries, episode tracking, download management
- **Key operations**: `GET /series/lookup`, `POST /command`, `GET /release`

### Radarr (Movies)
- **Endpoint**: `/api/v3/`
- **Used for**: Movie search, indexer queries, download management
- **Key operations**: `GET /movie/lookup`, `POST /command`, `GET /release`

### SABnzbd (Downloads)
- **Endpoint**: `/api`
- **Used for**: Queue monitoring, download control, history tracking
- **Key operations**: `queue`, `history`, `pause`, `resume`, `delete`

### TMDB (The Movie Database)
- **Endpoint**: `/3/`
- **Used for**: Streaming availability, provider logos, metadata enrichment
- **Key operations**: `search/movie`, `search/tv`, `watch/providers`

### AI Provider (OpenAI/Anthropic/Ollama)
- **Used for**: Natural language query parsing, release suggestions
- **Models**: Configurable (default: `gpt-5-nano`)
- **Operations**: Intent parsing, release ranking

---

## Development Notes

### Current State

- **Version**: 0.1.0
- **Status**: Functional MVP with all core features implemented
- **Theme**: Nebula-inspired (cyan/fuchsia/violet palette)
- **Recent work**: Per-episode tracking, season progress, group-based releases, rebranding to Quasrr

### Known Technical Debt

1. **Frontend monolith**: `page.tsx` is 4076 lines and needs component extraction
2. **No authentication**: Currently relies on network isolation (Tailscale)
3. **No automated tests**: Manual testing only
4. **No state management library**: Using useState/useEffect (may need Context API or Zustand)

### Development Workflow

1. Make changes locally
2. Commit to git
3. Deploy to NAS via `docs/scripts/nas.sh quasrr up-build`
4. Smoke test via `docs/scripts/smoke.sh quasrr --path /`
5. Manual browser verification

### API Endpoints

Key backend endpoints:

- `GET /health` - Health check
- `GET /config` - Get configuration (secrets redacted)
- `GET /search` - Stage 1: Discover titles
- `GET /releases` - Stage 2: Get indexer releases
- `POST /releases/grab` - Download a single release
- `POST /releases/grab-all` - Download multiple releases
- `GET /sab/queue` - Get SABnzbd queue
- `GET /sab/recent` - Get recent downloads
- `POST /ai/intent` - Parse natural language query
- `POST /ai/release/suggest` - Get AI release suggestion
- `GET /availability` - Get streaming availability
- `GET /integrations/status` - Check integration health

Full API documentation: http://localhost:8000/docs (when running)

---

## Quality Preferences

Quasrr is designed around realistic file sizes for casual viewing:

### TV Shows

**1-hour episodes:**
- Target: 800MB - 1.2GB per episode
- Format: WEBDL-720p preferred
- Avoid: BluRay rips (too large), SD quality (too low), HEVC (compatibility issues)

**30-minute episodes:**
- Target: 400MB - 500MB per episode
- Same format preferences as above

### Movies

- Target: 2GB - 4GB for a typical 2-hour movie
- Format: WEBDL-720p preferred
- Practical over perfect quality

### Red Flags

Releases are automatically deprioritized if they match these patterns:

- Files claiming 720p but <300MB (likely re-encoded garbage)
- Files >3GB for TV episodes (unnecessary for 720p)
- HEVC/x265 encodes (compatibility concerns on some devices)

AI suggestions use these preferences to rank releases.

---

## Roadmap

### Completed ✅

- [x] Natural language search with AI intent parsing
- [x] Streaming availability detection (TMDB)
- [x] Release search and filtering
- [x] Per-episode download tracking
- [x] Season progress indicators
- [x] Group-based release organization
- [x] SABnzbd queue management
- [x] Mobile-optimized UI with nebula theme
- [x] Search by ID (TMDB/TVDB/IMDB)
- [x] Icon-based status indicators

### Planned 📋

**Near-term:**
- [ ] Component refactoring (extract types, utils, hooks, components from monolithic page.tsx)
- [ ] Background animation improvements
- [ ] Performance optimization (memoization, lazy loading)

**Long-term:**
- [ ] Authentication (possibly piggyback on Sonarr/Radarr auth)
- [ ] Custom quality profiles per user
- [ ] Watchlist functionality
- [ ] Download scheduling
- [ ] Multi-language support
- [ ] Dark/light theme toggle
- [ ] PWA offline support
- [ ] Automatic monitoring/downloads 
- [ ] Library management 


### Non-Goals ❌
- Media playback (use Plex/Jellyfin)
- Cloud deployment (self-hosted only)
- Complex authentication (network-level security preferred)

---

## License

MIT License - See LICENSE file for details

---

## Credits

Built with love for casual media consumers who want control without complexity.

**Maintainer**: Derek
**Project Start**: January 2025
**Current Version**: 0.1.0
**Codename**: Quasrr (formerly Shiny-Palm-Tree)
