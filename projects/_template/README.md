# Project Template

This is the tracked reference layout for a single outreach project.

Do not work directly in `_template/`. Copy it to `projects/<slug>/`, then fill in:

- `workspace/` with product context
- `research/` with niche notes
- `reddit/config.json` and `reddit/templates.json` from `starter-assets/reddit/`
- `reddit/guidance/` from `starter-assets/reddit/guidance/`
- `x/config.json` from `starter-assets/x/config.example.json`
- `x/.env` from `starter-assets/x/.env.example` when X is used

Archive conventions for migrated legacy artifacts:

- `research/archive/review_batches/`
- `reddit/output/archive/legacy_intents/`
- `reddit/output/archive/orphaned_auth/`
- `x/output/archive/legacy_intents/`

Canonical commands:

- `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.reddit.setup_auth`
- `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.reddit.main`
- `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.reddit.actions summary`
- `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.x.setup_auth`
- `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.x.main --headless`
- `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.x.actions summary`
