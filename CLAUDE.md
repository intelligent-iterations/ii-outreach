# CLAUDE.md

## Repo Role

This repo is agent-first. Treat a user's product description as input for reusable outreach state, not a one-off run.

The repo root is shared scaffolding. Active project state should live under gitignored `projects/<slug>/`, not in tracked root files.

For Reddit, assume the default decision-maker is the operator-authored project state, not Grok. The agent writes templates and guidance up front; the runtime should prefer local template-driven discovery, intent selection, and message rendering unless the active project explicitly chooses `decision_engine.mode = "grok"`.

Keep separate:
1. `product brief`
2. `strategy + keyword state`
3. `message templates`
4. `reviewable posting intent`

Anything needed for reruns should be saved in repo state.

## Output Rules

- Product context lives under `projects/<slug>/workspace/`
- Prompt contracts live under `projects/<slug>/prompts/`
- Outreach config lives in `projects/<slug>/config.json`, `projects/<slug>/templates.json`, and `projects/<slug>/x-outreach/config.json`
- Safe-mode runs stage intended actions under `projects/<slug>/output/intended_actions/<run-id>/`
- Run logs and dry-run artifacts live under `projects/<slug>/output/`
- Runtime cookies and trackers live under `projects/<slug>/data/`, `projects/<slug>/tracking/`, and `projects/<slug>/x-outreach/data/`

Do not leave generated strategy, credentials guidance, or review artifacts in ad hoc notes or chat only.

## Default Behavior

- Start by creating or selecting `projects/<slug>/` for the active product.
- If needed, scaffold that project by copying starter assets from repo root into the new project directory.
- Start product state by writing or updating `projects/<slug>/workspace/PRODUCT_PROFILE.md`.
- If the user provides tone examples, save them in `projects/<slug>/workspace/VOICE_EXAMPLES.md`.
- Before writing templates, research real Reddit posts/comments in the relevant niche and distill the tone into project state.
- Check likely target subreddit norms when self-promo risk is material.
- Translate the product brief into reusable keyword buckets, templates, and prompt files.
- Prefer editing saved templates/config over hiding logic in one-off prompt text.
- Safe mode is the default. Stage intended actions first and let the user review before dispatch.
- Onboarding is part of the agent workflow. If the user provides account credentials in chat, move them into local `.env` or local config and then run onboarding.
- Dependency installation is part of onboarding. The setup commands should bootstrap repo requirements before attempting auth.
- Auth state must be generated locally for the active project. Do not depend on cookies or passwords copied from another repo.
- Cookies, screenshots, logs, and other runtime state must stay gitignored.
- If credentials are missing, the agent should ask for them or instruct the user to place them in `.env` / config, then continue with onboarding.
- For user-owned open-source repos, transparent maintainer disclosure is usually the right default.

## Project Activation

- The active project root is `projects/<slug>/`.
- All local runs should set `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug>`.
- If the user wants a new product setup, create a new slug instead of overwriting another project's files.
- The tracked repo root should stay generic and reusable for any contributor who clones it.

## Auth Model

Two auth tracks matter here:

1. Research / AI services
   - Optional env keys such as `XAI_API_KEY`
   - These support triage or generation quality, but are separate from posting auth

2. Platform auth
   - Reddit uses local `REDDIT_USERNAME` / `REDDIT_PASSWORD` env vars or credentials in `projects/<slug>/config.json`
   - X uses local `X_USERNAME` / `X_PASSWORD` env vars or credentials in `projects/<slug>/x-outreach/config.json`
   - Fresh cookies are created locally and reused from project-local gitignored `data/`

Onboard with:

```bash
OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.setup_auth
cd x-outreach && OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.setup_auth
```

## Standard

The work is not done if the project can run once but the product brief, strategy state, onboarding path, and review queue are not left behind in reusable project state.
