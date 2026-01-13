# Automation & Agentic Workflow

## What “Agentic” Means Here
- The agent may create or modify many files in one pass
- The agent may run commands and iterate without approval per step
- The agent stops when the stated goal and stop condition are met

## What It Does NOT Mean
- No background work when the user is gone
- No open-ended “build everything” tasks
- No silent architectural rewrites

## Session Structure
Each session should have:
1. **Explicit goal**
2. **Clear stop condition**
3. **Verification output**

## Good Stop Conditions
- Docker boots without errors
- `/health` endpoint responds OK
- Frontend loads and talks to backend

## Bad Stop Conditions
- “Build the app”
- “Implement all features”

## Execution Rules
- If commands can be run, run them
- If something fails, fix it before stopping
- Summarize what changed at the end of the session
