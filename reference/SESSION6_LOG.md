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


TODOs (next session)
- Search button - when clicked, greys out and turns to "..." I think.  When just pressing enter in the search box, the button does nothing.  Make ENTER do the same thing.
- Original search - info modal does not show Streaming services items.  Only the AI modal does.  Need to make them the same.  Basically, AI modal shows what AI thinks the user is looking for.  Original search just lists the searches.
- Add Home button to top of menu for reset/start.
- Add menu item for Tools -> Sonarr, Radarr, SABnzbd, Plex (links to)
- Add menu item for Streaming Services -> Link to homepage of each services that is enabled in settings

TODOs (Longer Term)
- Animate background more if possible.
- Authentication - can we piggyback on Sonarr or Radarr?
- Major design changes placeholder (details later).
