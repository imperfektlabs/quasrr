# Project Brief

## Project Name
Shiny-Palm-Tree

## Goal
Build a self-hosted, Docker-based, mobile-first application that unifies:
- Media search
- Streaming availability awareness (Canada-first)
- Manual download workflows
- Unified download queue visibility

This replaces the need to juggle Sonarr, Radarr, SABnzbd, and JustWatch separately.

## Non-Goals
- No auto-monitoring or PVR behavior
- No silent or automatic downloads
- No library perfectionism or archival workflows
- No SaaS deployment, auth complexity, or cloud lock-in

## User Behavior (Critical)
- Manual search only
- User always approves downloads
- Chooses releases by **file size realism**, not max quality
- Casual watch-and-delete usage
- Low volume, intentional interaction

## Quality Preferences & Defaults
User has clear patterns based on experience:

**TV Shows (1 hour episodes):**
- Target: 800MB - 1.2GB per episode
- Format: WEBDL-720p preferred
- Avoid: BluRay rips (too large), SD quality (too low), HEVC when unstable

**TV Shows (30 min episodes):**
- Target: 400MB - 500MB per episode
- Same format preferences as above

**Movies:**
- Target: "Whatever is practical" (roughly 2-4GB for 2hr movie)
- Same format preferences

**Red Flags:**
- Files claiming 720p but <300MB (re-encoded garbage)
- Files >3GB for TV episodes (overkill)
- HEVC encodes (compatibility concerns)

AI should learn and suggest releases in these ranges by default.

## Core MVP Features
1. **Unified Search**
   - One search box
   - Accepts natural language
   - Determines movie vs TV automatically

2. **Streaming Availability First**
   - Country-aware (default: Canada)
   - Shows only services the user has configured
   - Deep links to native apps
   - Download options shown when not available (or optionally always visible)

   ### Supported Canadian Services (Priority Order)
    1. **Netflix Canada**
    2. **Crave** (Canadian exclusive - HBO, Showtime content)
    3. **Disney+ Canada**
    4. **Amazon Prime Video Canada**
    5. **Apple TV+ Canada**
    6. **Paramount+ Canada**
    7. **CBC Gem** (free, Canadian)
    8. Stack TV (Corus content)

User configures which services they subscribe to.
Deep links must support Canadian app stores and regional URLs.

3. **Manual Download Workflow**
   - Uses Sonarr/Radarr interactive search
   - Displays real release results
   - Mobile-friendly cards
   - User explicitly chooses what to download

4. **AI-Assisted Pattern Recognition**
   - Identifies matching release groups
   - Suggests similar quality/size across episodes
   - Flags anomalies
   - Never downloads automatically

5. **Unified Queue**
   - SABnzbd queue enriched with context
   - Shows what is downloading and why

## Tech Stack (Locked)

**Backend:**
- Python 3.11+
- FastAPI (async web framework)
- SQLite (database)
- httpx (async HTTP client)
- Pydantic (data validation)

**Frontend:**
- Next.js 14 (App Router)
- React 18+
- Tailwind CSS (utility-first styling)
- PWA support (installable on mobile)

**APIs & Libraries:**
- `simple-justwatch-python-api` (streaming availability)
- Pluggable AI provider SDK (OpenAI / Anthropic / Ollama)
- Direct API calls to Sonarr/Radarr/SABnzbd (no libraries needed)

**Infrastructure:**
- Docker + Docker Compose
- Multi-stage builds (smaller images)
- Health checks on all services
- Tailscale-compatible (internal networking)

## AI Rules
- AI provider must be pluggable (BYO API key)
- Support OpenAI / Anthropic / local models
- AI assists decisions, never replaces user intent
