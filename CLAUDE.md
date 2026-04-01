# CLAUDE.md

## Repo Role

This repo is a reusable outreach engine plus starter assets. Treat the tracked repo as scaffolding and `projects/<slug>/` as the live working surface.

The runtime contract is now symmetric:

- Reddit project files live under `projects/<slug>/reddit/`
- X project files live under `projects/<slug>/x/`
- Shared product context lives under `projects/<slug>/workspace/` and `projects/<slug>/research/`

## Source Of Truth

Save durable state in the repo, not only in chat:

- product context: `workspace/`
- research and moderation notes: `research/`
- Reddit config/templates/guidance: `reddit/`
- X config and auth/runtime state: `x/`
- staged actions: `reddit/output/actions/` and `x/output/actions/`

Use clear names:

- `guidance/` instead of `prompts/`
- `auth/` instead of `data/`
- `tracking/` for state files
- `output/logs/` for screenshots and action logs

## Default Behavior

- Start by creating or selecting `projects/<slug>/`.
- Write `workspace/PRODUCT_PROFILE.md` first.
- Save tone examples in `workspace/VOICE_EXAMPLES.md` when available.
- Research the niche before finalizing templates or keyword buckets.
- Prefer operator-authored strategy and templates by default.
- Only use Grok when the active Reddit config explicitly enables it.
- Safe mode is the default on both platforms.
- Stage actions before posting:
  - Reddit: `projects/<slug>/reddit/output/actions/`
  - X: `projects/<slug>/x/output/actions/`
- Use the CLI before manual browsing:
  - `python -m src.reddit.actions ...`
  - `python -m src.x.actions ...`

## Runtime Commands

Always set:

```bash
OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug>
```

Primary commands:

```bash
python -m src.reddit.setup_auth
python -m src.reddit.main
python -m src.reddit.actions summary
python -m src.reddit.review_ui

python -m src.x.setup_auth
python -m src.x.main --headless
python -m src.x.actions summary
```

## Auth Model

- Reddit credentials belong in `projects/<slug>/reddit/.env` or `projects/<slug>/reddit/config.json`
- X credentials belong in `projects/<slug>/x/.env` or `projects/<slug>/x/config.json`
- Cookies belong in `projects/<slug>/reddit/auth/` and `projects/<slug>/x/auth/`
- Tracking state belongs in each platform's `tracking/`

Do not rely on copied cookies or shared machine state.

## Standard

The task is not complete unless the project is left in a reusable shape:

- product profile saved
- strategy/guidance saved
- auth path documented
- actions easy to find
- docs updated when the repo contract changes
