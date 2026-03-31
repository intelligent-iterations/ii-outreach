# Security

This repo is designed so the shared codebase stays publishable while real operator state stays local.

## Core Rules

- Keep product-specific runtime state under gitignored `projects/<slug>/`.
- Prefer per-project `.env` files for credentials.
- Treat cookies, screenshots, staged outputs, and trackers as local-only artifacts.
- Re-run onboarding on the current machine instead of moving browser cookies between machines.
- Do not put live passwords, API keys, or session exports in tracked root files.

## What Belongs In Git

- Shared runtime code in `src/` and `x-outreach/src/`
- Starter prompt files in `prompts/`
- Starter config and template scaffolds
- Operator docs like `README.md`, `AGENTS.md`, and `CLAUDE.md`

## What Must Stay Local

- `projects/<slug>/**`
- `.env`
- browser cookie exports
- run logs
- intended action artifacts
- screenshots
- local virtualenvs and caches

## Preferred Credential Flow

1. Put credentials in `projects/<slug>/.env` or `projects/<slug>/x-outreach/.env`
2. Run onboarding
3. Let the browser automation save fresh local cookies inside the active project
4. Use safe mode and staged review before live posting

Config-based passwords are supported for local convenience, but they should still live inside gitignored project files. `.env` is the safer default.

## Reporting

If you find a security issue in the shared repo surface, document the exact file and behavior, then fix or isolate it before pushing the repo to a remote. For this repo, the expected standard is "safe to publish the scaffolding, unsafe to publish project state."
