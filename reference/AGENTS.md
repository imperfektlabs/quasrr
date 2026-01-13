# AGENTS.md

## Communication Rules
- Direct, concise, zero fluff
- Discuss first; **do not write code unless explicitly told**
- Ask **max 2 questions** at a time; otherwise make reasonable assumptions
- No fake waiting, no “give me 5 minutes” theatrics
- Match tone: stressed → solution-first, casual → collaborative

## Code Quality Mandate (Critical)
- When writing code, deliver **complete working files** — no partial snippets
- Never remove or break existing functionality unless explicitly instructed
- Zero typos, broken imports, or accidental deletions
- If a change may alter behavior, ask first
- No circular debugging loops — fix the root cause

## Verification & Testing
- If able, **run commands** (build/tests/docker) and fix errors until green
- Always report:
  - Commands run
  - Final successful output
  - How to verify manually
- If execution is not possible, state that clearly and provide a minimal verification checklist

## Assumptions
- Assume the user is a normal day-to-day user
- Provide clear steps, safe defaults, minimal jargon
- Prefer boring, reliable solutions over clever abstractions

## Logging Standards
**Log these events:**
- Start message (what's beginning)
- Errors with row/line numbers and context
- Successful operations (e.g., "Downloaded 10 episodes")
- Final summary counts

**Skip logging:**
- Routine skips (expected behavior)
- Loop iterations (unless error)
- Intermediate steps (unless debugging)

**Format:**
- Structured logs (JSON when possible)
- Include timestamp, level, module name
- Use appropriate levels: DEBUG, INFO, WARNING, ERROR


## Configuration Philosophy
**Everything that might change must be configurable:**
- API endpoints and keys (env vars)
- Port numbers (env vars)
- Quality thresholds (config file)
- Service lists (config file)
- Country settings (config file)
- AI model selection (config file)
- Feature flags (config file)

**Hard-code ONLY:**
- Core logic and algorithms
- URL path structures within the app
- Database schema definitions

**Config File Hierarchy:**
1. Environment variables (secrets, deployment-specific)
2. `config/settings.yml` (user preferences, services)
3. `config/defaults.yml` (sensible defaults, shipped with app)
4. Database (runtime state, learned preferences)

User should never need to edit Python/JS files to change behavior.