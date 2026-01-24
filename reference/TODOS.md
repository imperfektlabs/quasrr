TODOs

- Fix AI Suggest failure with real error handling. --> DONE
- Move AI intent toggle + "AI is interpreting..." into Filters row. --> DONE
- Fix plan modal poster sizing/cropping. --> DONE
- Rename copy to "Stream instead of downloading". --> DONE
- Highlight subscribed providers directly in boxes; remove "Available on your services" line. --> DONE
- Improve release list layout/readability. --> DONE

- Show availability modal even when AI intent toggle is off. --> DONE

- Enable searching by IDs (tmdb/tvdb/imdb). --> DONE
- Remove subtitle line hidden by frozen title bar. --> DONE
- Downloads and System Status: remove collapsed start since they are on their own pages. --> DONE
- Strip out low-value streaming services (ex: Netflix with Ads) if desired. --> DONE

- Search button - when clicked, greys out and turns to "..." I think.  When just pressing enter in the search box, the button does nothing.  Make ENTER do the same thing. --> DONE
- Original search - info modal does not show Streaming services items.  Only the AI modal does.  Need to make them the same.  Basically, AI modal shows what AI thinks the user is looking for.  Original search just lists the searches. --> DONE
- Add Home button to top of menu for reset/start. --> DONE
- Add menu item for Tools -> Sonarr, Radarr, SABnzbd, Plex (links to) --> DONE
- Add menu item for Streaming Services -> Link to homepage of each services that is enabled in settings --> DONE
- Remove Grab button from the AI modal and info modal --> DONE
- Enable Grab button when displaying all releases in group mode so user can download all from that same group --> DONE
- Group mode: bucket releases by group -> season -> format (res + source + codec). --> DONE
- Grab All: confirmation modal with per-episode preselect and Select All toggle. --> DONE
- Combine AI/info modals into single availability modal with shared ESC behavior. --> DONE
- TV library status should reflect per-episode downloaded state, not a single flag. --> DONE
- results page - tighten card, there is space under the posters... why is that? --> DONE
- results page - change in library (downloaded) to icons as discussed before --> DONE
- results page - first 25 are shown - probably rarely need to go past that... maybe change 25 to 10, and allow a second page - will take make it faster? --> DONE
- Bug: AI search episodes by date --> DONE





Overall
- Add dashboard summary at the top, that scrolls off the page, locking the rest (Sonarr, Radarr, SAB, Possibly Plex if room) - could allow option in settings to enable/disable these cards
- replace header with same header as the rest (are the others actual pages or just models themselves?) --> DONE


Library
- add search to top of library - live filter of the results below as you type
- apply chip filtering to library cards (movie) & (tv) in the same way as the discoverycards



Search
- tighten up the search card - and lock it to the top when scrolling - just move the searchfield into the header when scrolling if possible



Modals
- Make episode modal in sonarr/radarr pages the same width as release modal --> DONE
- make the releases modal look the same as the sonarr/radarr episode list modal
- Add airdate to episode modal view
- possibly add quality profile instead of checkmark
- Larger text on the episodes list to match the other modals



AI integration
- Add Gemini
- Add OpenRouter
- Add Deepseek
- Add local LLMs
- Basically make it Bring-your-own-API key





Bugs
- Fix Sonarr/Radarr icons not working on mobile
- prevent mobile page zooming in when clicking into search field














TODOs (Longer Term)
- investigate voice recognition for the searches

- Animate background more if possible.
- Authentication - can we piggyback on Sonarr or Radarr?
- Major design changes placeholder (details later).
