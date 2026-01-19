SESSION_LOG7.md

Summary
- Implemented per-episode TV download awareness, season progress, and group-level status badges; improved Grab All behavior to skip already-downloaded episodes.
- Refined search and releases UI (modal close pinning, icon actions, mobile layout consistency, tighter cards, pagination size) and added a richer landing panel.
- Rebranded to Quasrr and shifted the theme to a nebula palette; added tool icons with health-based greyscale in the menu.

Key Frontend Changes
- `frontend/src/app/page.tsx`
  - TV releases: season progress, group badges, and Grab All preselect skips downloaded episodes.
  - SAB polling only on Downloads tab; recent groups default collapsed.
  - Release list: icon-based Grab/Grab All, mobile layout stabilization, and consistency tweaks.
  - Results cards: density tweaks, status icons, page size 10.
  - AI intent: search runs in background; closing AI modal returns to results; landing hero panel added.
  - Menu: tool icons from favicons with greyscale when integrations are down.
  - App name updated to Quasrr in header/landing.
- `frontend/src/app/layout.tsx`
  - App title set to Quasrr.
- `frontend/src/app/globals.css`
  - Nebula-inspired background and glass styling palette update.

Key Backend Changes
- `backend/integrations/sonarr.py`
  - Per-episode download map and season progress returned with TV release responses.
- `backend/config.py`
  - App name set to Quasrr.
- `backend/main.py`
  - Logs and API title updated to Quasrr.

Config/Docs Changes
- `config/defaults.yaml`
  - App name updated to Quasrr.
- `compose.yml`
  - Header comment updated to Quasrr.
- `/mnt/nas_z/AGENTS.md`
  - Added completion expectation to bring stacks up for verification (later user requested to skip for last change).

Notes / Behavior
- Theme shifts to cyan/fuchsia/violet accents; button and badge colors updated accordingly.
- Tool icons rely on each service’s `/favicon.ico`; Plex status is not checked.

Pending / Known Gaps
- None noted in-session.
