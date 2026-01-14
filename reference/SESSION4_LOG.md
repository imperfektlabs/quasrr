SESSION 4 LOG

Overview
This session focused on adding AI-assisted intent flow, streaming availability, and download actions,
plus tighter Sonarr handling for air-date episodes. It also started shaping the UI for AI context
and streaming services configuration.

What changed (feature-level)
- Download triggering: Grab buttons now trigger Sonarr/Radarr "grab" endpoints.
- Queue deletes: Deletes are routed via Sonarr/Radarr to keep their queues consistent.
- AI intent flow: New AI intent endpoint, plan modal, and toggle to interpret the search.
- AI release suggest: New endpoint and UI, with payload trimming to reduce token usage.
- Streaming availability: TMDB watch-provider lookup wired into the plan modal.
- Streaming services config: UI selector that persists enabled services to settings.yaml.
- TV air-date resolution: Sonarr now maps air-date queries to exact season/episode.
- SAB polling: interval reduced with overlap guard to avoid overlapping requests.

Backend changes (notable)
- Added AI intent endpoint and supporting payload structure.
- Added TMDB availability lookup and providers endpoint.
- Sonarr now fetches episode list and resolves air-date to S/E, filtering release results.
- Sonarr "all seasons" requests use air-date fallback where available.
- Fixed build crash: missing date import in Sonarr integration.

Frontend changes (notable)
- AI plan modal with poster/overview, streaming provider icons, and fallback availability call.
- AI intent toggle surfaced; "AI is interpreting..." line added.
- Streaming services selector UI + persistence.
- Releases highlight the requested episode.

User feedback / issues observed
- AI Suggest reported "AI failed to fetch" in practice.
- Plan modal poster rendered inconsistently (cropping/sizing).
- Release list layout was too dense to scan.
- Availability links are TMDB watch-provider URLs, not direct deep links.
- Sonarr 500s observed on some season searches; air-date resolution reduced impact.

Follow-ups requested for Session 5
- Fix AI Suggest failure with real error handling.
- Move AI intent toggle + "AI is interpreting..." into Filters row.
- Fix plan modal poster sizing/cropping.
- Rename copy to "Stream instead of downloading".
- Highlight subscribed providers directly in boxes; remove "Available on your services" line.
- Improve release list layout/readability.
- TV library status should reflect per-episode downloaded state, not a single flag.
- Optional: show availability modal even when AI intent toggle is off.
