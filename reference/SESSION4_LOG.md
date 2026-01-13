SESSION 4 LOG

Summary
- Implemented download triggering via Sonarr/Radarr grab endpoints and wired Grab buttons in UI.
- Routed queue deletes through Sonarr/Radarr to keep queues in sync.
- Added AI release suggestion endpoint + UI, with payload trimming to reduce token size.
- Added AI intent parsing + plan modal, plus TMDB availability lookups and streaming provider display.
- Added streaming services selector (persisted to settings.yaml) and TMDB provider/logo support.
- Added air-date-based episode resolution in Sonarr to map talk show dates to exact S/E.
- Reduced SAB polling interval with overlap guard.

Key Changes
- Backend: new AI intent endpoint, TMDB availability, and TMDB providers endpoint.
- Backend: Sonarr episode list lookup + air-date resolution + filtered release results.
- Frontend: AI plan modal with poster/overview, streaming provider icons, and availability call fallback.
- Frontend: AI intent toggle, streaming services checkboxes, and release highlight for requested episode.

Fixes
- Backend build crash fixed (missing date import in Sonarr integration).

Known Issues / Observations
- AI Suggest still reports "AI failed to fetch" (needs investigation).
- Plan modal poster sometimes renders oddly (needs sizing or image fit adjustments).
- Release list UI is crowded and hard to scan.
- Availability links are TMDB watch-provider links (not direct provider deep links).
- Sonarr 500s observed on some season release searches; air-date resolution mitigates scatter.

Future Item (Requested)
- Add option: show availability modal even when AI intent toggle is off.

Session 5 TODOs (from user)
- Fix AI Suggest failure (provide real error + make it succeed).
- Move "AI intent parsing" toggle and "AI is interpreting..." line to the Filters row.
- Fix plan modal poster display (no odd cropping/size).
- Replace text "watch instead of downloading" with "Stream instead of downloading".
- Highlight subscribed streaming services by styling the provider box (remove "Available on your services" line).
- Improve release search results list layout/readability.
- In library - downloaded only means that SOMETHING is downloaded.  for a movie that makes sense since there is only one thing.  For a TV show, it makes no sense.  Need to have the system check with Sonarr and know which episodes are downloaded and what isn't, and reflect that in the search results. If already downloaded, show it in results, but mark that it is already d/l
