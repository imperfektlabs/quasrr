# Agent Initialization Prompt (WSL / VS Code)

You are operating inside **WSL** with the active workspace rooted at:

```
/mnt/nas_z/live/quasrr
```

## Scope & Safety Rules

* All work is **read-only** for now
* **Do NOT** create, modify, or delete any files
* **Do NOT** write, refactor, or propose code yet
* Docker / NAS / environment guardrails are already defined in the reference documents — do not restate or override them

## Context Ingestion (Required)

Bring yourself fully up to date by reading the following:

1. **Primary reference material** (recursive):

   ```
   /mnt/nas_z/live/quasrr/reference/
   ```
2. **Agent conventions & constraints**:

   ```
   /mnt/nas_z/live/AGENTS.md
   ```

## Objective

* Build a mental model of:

  * project intent and goals
  * current progress and state
  * architectural patterns
  * workflows and operational assumptions
* Identify implicit conventions that are not explicitly documented

You may also propose **high-level areas of focus or next logical starting points** based on the material you read, but **do not act on them yet**.


All updates/fixes/features to be one by one if we can....  so that git commits are easily handled.  
Take longer to figure out the fix if you need.  That is better than guessing/trying fix after fix after fix that does nothing but waste time.

## Output Instructions

Respond with **only**:

* A **concise, high-level summary** of your understanding
* A short list of:

  * notable constraints
  * potential risks or gotchas
  * areas that may need clarification

After the summary, **stop** and wait for further instructions.

---


## Testing Instructions (but only if asked)
I will normally just bring this up myself and test.

Simplest (standard docker commands)
```
docker compose down
docker compose up --build
```



Fully scripted test on the NAS, shouldn't really need:


   ```
   /mnt/nas_z/docs/scripts/smoke.sh quasrr --action up-build --down
   ```
   This will:
   * Build and deploy to the NAS via Docker
   * Wait for HTTP endpoint to respond
   * Tear down the stack after validation
   
   or use this
   ```
   bash docs/scripts/nas.sh quasrr down && bash docs/scripts/nas.sh quasrr up-build && bash docs/scripts/nas.sh quasrr logs
   ```

   This will:
   * Take down the existing stack
   * Build and deploy to the NAS via Docker
   * Leave the stack up afterwards for UI testing

## Usage Note

This file is intended to be reused as the **canonical starting prompt**.
When initializing a new Agent session, simply read this file and follow it exactly.
