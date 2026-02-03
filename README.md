# Quasrr

**Unified media search, streaming awareness, and intentional downloads for casual viewers.**

Quasrr is a self-hosted, mobile-first web app that brings discovery, streaming availability, and manual download workflows into one clean interface. It favors intentional, size-conscious downloads over automation and complexity.

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
- **Size-conscious quality** - Practical file sizes over maximum quality.
- **AI-assisted, not automated** - AI suggests releases based on your preferences, but never downloads automatically.
- **Mobile-optimized** - Touch-friendly interface designed for phones and tablets.
- **Low-volume usage** - Built for casual, intentional viewing, not archival or library perfectionism.

---

## Features

### Current (v0.1.0)

✅ **Unified Discovery + Library**
- Single discovery page and a unified Library for movies + TV
- Multi-select filters (downloaded/missing/monitored) and sortable results
- Inline search panel with optional top/bottom positioning
- Media cards with status badges, rating links, and per-title actions

✅ **AI-Assisted Search**
- Natural language parsing with intent modal
- Episode date support (for daily shows)
- Search by ID (TMDB/TVDB/IMDB)
- Background AI search with clean fallback behavior

✅ **Streaming Availability**
- Country-aware provider detection (TMDB)
- Local SVG logos and subscription highlighting
- Per-title availability in AI, discovery, and library modals

✅ **Manual Download Workflow**
- Release search via Sonarr/Radarr indexers
- Grouped TV releases (per-episode) and per-season search
- Grab single releases or multi-select groups
- Per-episode download tracking and season progress

✅ **Download Management (SABnzbd)**
- Queue + recent history with grouping
- Pause/resume/delete individual jobs
- Pause/resume entire queue
- Recent download history with deep links into Library

✅ **Library Actions**
- Per-episode delete (Sonarr episode file delete)
- Inline release expansion by episode
- Deep links to Library with season auto-expand

✅ **System + Settings**
- Integration health monitoring (Sonarr, Radarr, SABnzbd)
- Settings UI for streaming services, country, AI provider/model
- Dashboard card toggles and layout options
- SAB recent group limit setting

✅ **UI/UX**
- Nebula-inspired theme with glass panels
- Mobile-first layout and touch-friendly actions
- Dashboard cards with tool shortcuts and status styling

---

## Architecture

Quasrr uses a containerized frontend + backend architecture:

```
┌─────────────────┐
│   Frontend      │  Next.js 14 (React 18 + Tailwind CSS)
│   Port: 3000    │  App Router + client-side interactions
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

1. **Discovery**: User searches -> AI parses intent -> Backend searches Sonarr/Radarr + TMDB availability
2. **Releases**: User selects title -> Backend triggers indexer search -> Results grouped by episode/quality
3. **Download**: User grabs a release -> Sonarr/Radarr triggers SABnzbd
4. **Monitoring**: Frontend polls SABnzbd queue/history -> Deep links into Library

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
- **React 18** - UI library with hooks
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Health checks** - Container reliability

---

## Project Structure

```
quasrr/
├── backend/                      # FastAPI backend service
│   ├── main.py                   # API routes and application entry
│   ├── config.py                 # Configuration management
│   ├── requirements.txt          # Python dependencies
│   ├── Dockerfile                # Backend container image
│   └── integrations/             # External service clients
│       ├── ai.py                 # OpenAI/Anthropic/Ollama integration
│       ├── plex.py               # Plex summary metrics
│       ├── radarr.py             # Movie management API
│       ├── sabnzbd.py            # Download client API
│       ├── sonarr.py             # TV show management API
│       └── tmdb.py               # Streaming availability API
│
├── frontend/                     # Next.js frontend application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Discovery + dashboard UI
│   │   │   ├── library/page.tsx  # Unified Library UI
│   │   │   ├── layout.tsx        # Root layout with metadata
│   │   │   └── globals.css       # Global styles and theme
│   │   ├── components/           # Reusable UI components
│   │   │   ├── DetailModal.tsx
│   │   │   ├── MediaCard.tsx
│   │   │   ├── NavigationMenu.tsx
│   │   │   ├── ReleaseView.tsx
│   │   │   └── SearchPanel.tsx
│   │   ├── hooks/                # API, release, and UI hooks
│   │   ├── types/                # Shared TypeScript types
│   │   └── utils/                # Formatting and streaming helpers
│   ├── public/
│   │   ├── logos/ratings/         # Rating service logos
│   │   ├── logos/streaming/       # Streaming service logos (SVG)
│   │   └── logos/tools/           # Tool logos (SVG)
│   ├── package.json
│   ├── Dockerfile
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── config/                       # Application configuration
│   ├── defaults.yaml             # Default settings (shipped with app)
│   ├── settings.yaml             # User preferences (gitignored)
│   └── settings.example.yaml     # Example user settings
│
├── data/                         # SQLite database (gitignored)
├── logs/                         # Application logs (gitignored)
├── reference/                    # Documentation and session logs
│   ├── PROJECT_BRIEF.md
│   ├── TODOS.md
│   └── sessions/
│
├── .env                          # Environment variables (gitignored)
├── compose.yml                   # Docker Compose orchestration
├── .gitignore
└── README.md
```

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
  provider: openai
  model: gpt-5-nano

# Dashboard cards
dashboard:
  show_sonarr: true
  show_radarr: true
  show_sabnzbd: true
  show_plex: false

# Layout settings
layout:
  discovery_search_position: top
  library_search_position: top

# SABnzbd settings
sabnzbd:
  recent_group_limit: 10
```

### Default Settings (config/defaults.yaml)

Contains sensible defaults for quality preferences, feature flags, and streaming service definitions. See `config/defaults.yaml` for full details.

---

## Deployment

### Requirements

- Docker 20.10+
- Docker Compose 2.0+
- Sonarr instance (TV)
- Radarr instance (Movies)
- SABnzbd instance (Downloads)
- TMDB API key
- AI provider API key (OpenAI, Anthropic, or Ollama)

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

```bash
# From the docs/scripts/ directory
./nas.sh quasrr up-build    # Build and start containers
./smoke.sh quasrr --path /  # Wait for HTTP readiness
```

### Health Checks

- Backend: `http://localhost:8000/health`
- Frontend: `http://localhost:3000/`

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
- **Key operations**: `search/movie`, `search/tv`, `watch/providers`, `tv/{id}`

### AI Provider (OpenAI/Anthropic/Ollama)
- **Used for**: Natural language query parsing, release suggestions
- **Models**: Configurable (defaults vary by provider)
- **Operations**: Intent parsing, release ranking

---

## Development Notes

### Current State

- **Version**: 0.1.0
- **Status**: Functional MVP with core flows in place
- **Theme**: Nebula-inspired glass UI
- **Recent work**: Unified Library, AI modal polish, per-episode releases, streaming logos, dashboard/layout settings

### Known Technical Debt

1. **No authentication**: Relies on network isolation (Tailscale or LAN)
2. **No automated tests**: Manual testing only
3. **No state management library**: Uses React state and hooks

### Development Workflow

1. Make changes locally
2. Commit to git
3. Deploy to NAS via `docs/scripts/nas.sh quasrr up-build`
4. Smoke test via `docs/scripts/smoke.sh quasrr --path /`
5. Manual browser verification

### API Endpoints (Selected)

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
- `POST /config/settings` - Update non-secret settings

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

### Completed

- [x] Natural language search with AI intent parsing
- [x] Streaming availability detection (TMDB)
- [x] Release search and filtering
- [x] Per-episode download tracking
- [x] Season progress indicators
- [x] Grouped release organization
- [x] SABnzbd queue management
- [x] Mobile-optimized UI with nebula theme
- [x] Search by ID (TMDB/TVDB/IMDB)
- [x] Unified Library for movies and TV
- [x] Per-episode release expansion
- [x] Dashboard cards with tool shortcuts

### Planned

**Near-term:**
- [ ] Performance optimization (memoization, lazy loading)
- [ ] Release matching improvements for daily shows (date-first fallback)

**Long-term:**
- [ ] Authentication (possibly piggyback on Sonarr/Radarr auth)
- [ ] Custom quality profiles per user
- [ ] Watchlist functionality
- [ ] Download scheduling
- [ ] Multi-language support
- [ ] Dark/light theme toggle
- [ ] PWA offline support
- [ ] Automatic monitoring/downloads
- [ ] Library management enhancements

### Non-Goals
- Media playback (use Plex/Jellyfin)
- Cloud deployment (self-hosted only)
- Complex authentication (network-level security preferred)

---

## License

MIT License - See LICENSE file for details

---

## Credits

Built with love for casual media consumers who want control without complexity.

**Maintainer**: imperfektlabs
**Project Start**: January 2026
**Current Version**: 0.1.0
**Codename**: Quasrr
