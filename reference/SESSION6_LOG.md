SESSION6_LOG.md

Summary
- Added ID-based search handling (tmdb/tvdb/imdb) in UI + backend normalization.
- Expanded Download Activity and System Status by default; removed Download Activity hide/toggle.
- Removed search subtitle line and fixed AI intent modal poster to render full width.
- Filtered low-value streaming providers (Netflix with Ads variants) from TMDB availability.

Key Frontend Changes
- `frontend/src/app/page.tsx`
  - Search now recognizes `imdb:tt...`, `tmdb:123`, `tvdb:123` (and bare `tt...`).
  - ID searches bypass AI intent parsing and force TV filter for TVDB IDs.
  - Download Activity always visible; Queue + Recent always expanded; hide button removed.
  - System Status details open by default.
  - AI intent modal poster restored to full-width layout (natural height).
  - Subtitle line removed from the header area.

Key Backend Changes
- `backend/main.py`
  - Normalizes ID queries for `/search` and `/lookup` and auto-forces TV type for TVDB IDs.
  - Filters TMDB availability providers to drop "Netflix with Ads" variants.

Notes / Behavior
- One agent-side build hit `Unknown system error -10` during Next build; manual build succeeded.

Pending / Known Gaps
- Confirm ID search results in UI with a few real IDs (imdb/tmdb/tvdb).
