# Repo Structure

This file explains the repo by workflow role.

Use these labels:

- `Useful`: actively part of the intended workflow
- `Conditionally useful`: scaffold, compatibility shim, placeholder, or older helper that still has some value
- `Not useful`: local legacy state or generated artifacts that should not shape how contributors understand the repo

## Root

Purpose:
Shared repo-level scaffolding, operator instructions, and starter assets.

- `.env.example`: `Useful`
  Starter env scaffold.
- `.gitignore`: `Useful`
  Defines which files stay local.
- `AGENTS.md`: `Useful`
  Agent operating rules.
- `CLAUDE.md`: `Useful`
  Repo-specific operator behavior.
- `compose.yml`: `Useful`
  Container runtime with explicit CPU/RAM limits for local Docker usage.
- `Dockerfile`: `Useful`
  Chromium + Xvfb image for the Reddit and X browser automation flows.
- `README.md`: `Useful`
  Main workflow and setup guide.
- `REPO_STRUCTURE.md`: `Useful`
  This map of the repo.
- `config.example.json`: `Useful`
  Starter Reddit config scaffold.
- `requirements.txt`: `Useful`
  Reddit-side dependencies.
- `templates.json`: `Useful`
  Starter template library.

## `docker/`

Purpose:
Container entrypoint glue for local Docker runs.

- `docker/entrypoint.sh`: `Useful`
  Starts Xvfb inside the container and then execs the requested command.

## `projects/`

Purpose:
This is where real project state should live. Every product setup should get its own `projects/<slug>/`.

- `projects/.gitkeep`: `Conditionally useful`
  Keeps the folder present in the tracked repo.
- `projects/README.md`: `Useful`
  Defines the intended per-project layout.

Current note:
This clone may contain local gitignored project folders. Those are part of the intended runtime model, but they are not part of the tracked repo surface.

## `prompts/`

Purpose:
Starter prompt contracts that should usually be copied into a project and then tailored there.

- `prompts/base_system.txt`: `Useful`
- `prompts/competitor_alternative.txt`: `Useful`
- `prompts/discovery.txt`: `Useful`
- `prompts/problem_aware.txt`: `Useful`
- `prompts/triage_v2.txt`: `Useful`

The repo root intentionally does not contain live project config, auth state, runtime cookies, workspace files, output artifacts, or trackers.

## `src/`

Purpose:
Main Reddit engine. After the refactor, the real implementation lives in labeled subpackages and the root files are compatibility shims.

- `src/__init__.py`: `Conditionally useful`
  Package marker.
- `src/main.py`: `Conditionally useful`
  Compatibility wrapper for `python -m src.main`.
- `src/dry_run.py`: `Conditionally useful`
  Compatibility wrapper for `python -m src.dry_run`.
- `src/review_ui.py`: `Conditionally useful`
  Compatibility wrapper for `python -m src.review_ui`.
- `src/setup_auth.py`: `Conditionally useful`
  Compatibility wrapper for `python -m src.setup_auth`.
- `src/tools.py`: `Conditionally useful`
  Compatibility wrapper for `python -m src.tools`.

### `src/app/`

Purpose:
Top-level Reddit execution flows.

- `src/app/__init__.py`: `Conditionally useful`
  Package marker.
- `src/app/main.py`: `Useful`
  Primary Reddit run loop.
- `src/app/dry_run.py`: `Useful`
  Report/debug pipeline.
- `src/app/review_ui.py`: `Useful`
  Review and approval UI.
- `src/app/setup_auth.py`: `Useful`
  Reddit onboarding/auth bootstrap.

### `src/decision/`

Purpose:
The brains for Reddit outreach. Uses saved templates and guidance to discover leads, infer intent, and render messages.

- `src/decision/__init__.py`: `Conditionally useful`
  Package marker.
- `src/decision/templates.py`: `Useful`
  Local template selection, placeholder building, and message rendering.
- `src/decision/triage.py`: `Useful`
  Discovery and triage engine, including operator-local mode and optional Grok mode.

### `src/integrations/`

Purpose:
Operator-facing integrations outside the main run loop.

- `src/integrations/__init__.py`: `Conditionally useful`
  Package marker.
- `src/integrations/tools.py`: `Useful`
  Standalone Reddit helper tooling.

### `src/reddit/`

Purpose:
Reddit platform-specific automation and enrichment.

- `src/reddit/__init__.py`: `Conditionally useful`
  Package marker.
- `src/reddit/auth.py`: `Useful`
  Login and session handling.
- `src/reddit/comment.py`: `Useful`
  Comment posting logic.
- `src/reddit/dm.py`: `Useful`
  DM logic.
- `src/reddit/reddit_api.py`: `Useful`
  Reddit API context enrichment.
- `src/reddit/search.py`: `Useful`
  Lead search and extraction.

### `src/runtime/`

Purpose:
Runtime state, safety, and auditability for Reddit runs.

- `src/runtime/__init__.py`: `Conditionally useful`
  Package marker.
- `src/runtime/models.py`: `Useful`
  Core data models.
- `src/runtime/rate_limiter.py`: `Useful`
  Pacing and quota logic.
- `src/runtime/review_queue.py`: `Useful`
  Safe-mode staging queue.
- `src/runtime/run_logger.py`: `Useful`
  Per-run logs.
- `src/runtime/state.py`: `Useful`
  Central engagement state.
- `src/runtime/tracker.py`: `Conditionally useful`
  Older tracker-style state. Less central than `state.py`.

### `src/shared/`

Purpose:
Common plumbing shared across the Reddit side.

- `src/shared/__init__.py`: `Conditionally useful`
  Package marker.
- `src/shared/project_paths.py`: `Useful`
  Resolves `OUTREACH_PROJECT_DIR`.
- `src/shared/utils.py`: `Useful`
  Config loading, env loading, helpers, and logging.

## `x-outreach/`

Purpose:
Separate X module with its own runtime and package structure.

- `x-outreach/.env.example`: `Useful`
  Starter env scaffold.
- `x-outreach/README.md`: `Useful`
  X-side docs.
- `x-outreach/config.example.json`: `Useful`
  Starter X config.
- `x-outreach/requirements.txt`: `Useful`
  X-side dependencies.
- `x-outreach/tests/test_search.py`: `Useful`
  Small test coverage for X search parsing.

### `x-outreach/src/`

Purpose:
Main X engine. Root files are compatibility shims; the real implementation lives in subpackages.

- `x-outreach/src/__init__.py`: `Conditionally useful`
  Package marker.
- `x-outreach/src/main.py`: `Conditionally useful`
  Compatibility wrapper for `python -m src.main`.
- `x-outreach/src/setup_auth.py`: `Conditionally useful`
  Compatibility wrapper for `python -m src.setup_auth`.

### `x-outreach/src/app/`

Purpose:
Top-level X execution flows.

- `x-outreach/src/app/__init__.py`: `Conditionally useful`
  Package marker.
- `x-outreach/src/app/main.py`: `Useful`
  Primary X run loop.
- `x-outreach/src/app/setup_auth.py`: `Useful`
  X onboarding/auth bootstrap.

### `x-outreach/src/platform/`

Purpose:
X-specific automation.

- `x-outreach/src/platform/__init__.py`: `Conditionally useful`
  Package marker.
- `x-outreach/src/platform/auth.py`: `Useful`
  Login/session handling.
- `x-outreach/src/platform/reply.py`: `Useful`
  Reply and quote logic.
- `x-outreach/src/platform/search.py`: `Useful`
  Search and thread parsing.

### `x-outreach/src/runtime/`

Purpose:
Runtime state for X runs.

- `x-outreach/src/runtime/__init__.py`: `Conditionally useful`
  Package marker.
- `x-outreach/src/runtime/state.py`: `Useful`
  X action/state tracking.

### `x-outreach/src/shared/`

Purpose:
Common helpers shared across the X side.

- `x-outreach/src/shared/__init__.py`: `Conditionally useful`
  Package marker.
- `x-outreach/src/shared/project_paths.py`: `Useful`
  Resolves project-local paths for X.
- `x-outreach/src/shared/utils.py`: `Useful`
  Config loading, env loading, helpers, and logging.

## Generated Caches

Purpose:
None for humans.

- Any `__pycache__/` folder: `Not useful`
  Generated bytecode only. Ignore when reasoning about the repo.

## Practical Summary

Most important folders for understanding the workflow:

- `projects/`
- `prompts/`
- `src/app/`
- `src/decision/`
- `src/reddit/`
- `src/runtime/`
- `src/shared/`
- `x-outreach/src/app/`
- `x-outreach/src/platform/`
- `x-outreach/src/runtime/`
- `x-outreach/src/shared/`

Least useful things right now:

- all `__pycache__/` folders
