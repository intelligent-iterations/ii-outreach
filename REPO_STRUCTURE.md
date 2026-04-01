# Repo Structure

This repo is organized by role, not by history.

## Root

- `README.md`, `AGENTS.md`, `CLAUDE.md`
  Operator-facing docs and repo contract.
- `starter-assets/`
  Copyable starter config and guidance.
- `requirements/`
  Per-platform dependency lists.
- `projects/`
  Gitignored runtime state for real work.
- `src/`
  Shared engine and platform implementations.

## Source Code

```text
src/
  reddit/
    actions.py
    dry_run.py
    main.py
    review_ui.py
    setup_auth.py
    decision/
    runtime/
    shared/
    auth.py
    comment.py
    dm.py
    search.py
  x/
    actions.py
    dispatch_approved.py
    main.py
    setup_auth.py
    platform/
    runtime/
    shared/
```

Interpretation:

- `src/reddit/` is the real Reddit implementation.
- `src/x/` is the real X implementation.

## Starter Assets

```text
starter-assets/
  reddit/
    config.example.json
    templates.example.json
    guidance/
  x/
    config.example.json
    .env.example
```

## Project State

```text
projects/<slug>/
  workspace/
  research/
  reddit/
    config.json
    templates.json
    guidance/
    auth/
    output/
      actions/
      logs/
    tracking/
  x/
    config.json
    auth/
    output/
      actions/
      logs/
    tracking/
```

Naming rules:

- `guidance/` holds operator-authored instructions
- `auth/` holds cookies and login artifacts
- `tracking/` holds state files
- `output/actions/` holds staged intent
- `output/logs/` holds screenshots and action logs

Avoid old names like `prompts/`, `data/`, `review_batches/`, and `x-outreach/`.
