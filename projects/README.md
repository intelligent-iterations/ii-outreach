# Projects

Put live project state under `projects/<slug>/`.

This directory is gitignored on purpose so each clone can keep its own product context, credentials, cookies, outputs, and staged actions without leaking operator-specific state back into the shared repo.

Tracked exception:

- `projects/_template/` is checked in as the canonical scaffold for new projects.
- Real working projects should be siblings of `_template/`, not edits inside it.

Recommended shape:

```text
projects/<slug>/
  workspace/
    PRODUCT_PROFILE.md
    VOICE_EXAMPLES.md
  research/
    archive/
      review_batches/
  reddit/
    .env
    config.json
    templates.json
    guidance/
      base_system.md
      triage_v2.md
      discovery.md
      competitor_alternative.md
      problem_aware.md
    auth/
    output/
      actions/
        by_status/
        by_run/
      archive/
        legacy_intents/
        orphaned_auth/
      logs/
    tracking/
  x/
    .env
    config.json
    auth/
    output/
      actions/
        by_status/
        by_run/
      archive/
        legacy_intents/
      logs/
    tracking/
```

Use `projects/_template/` as the visual reference for the new layout. Copy it to `projects/<slug>/` and then hydrate the platform config files from `starter-assets/`.

Example bootstrap from the repo root:

```bash
export OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics"

mkdir -p \
  "$OUTREACH_PROJECT_DIR/workspace" \
  "$OUTREACH_PROJECT_DIR/research" \
  "$OUTREACH_PROJECT_DIR/reddit/auth" \
  "$OUTREACH_PROJECT_DIR/reddit/guidance" \
  "$OUTREACH_PROJECT_DIR/reddit/output/actions" \
  "$OUTREACH_PROJECT_DIR/reddit/output/logs" \
  "$OUTREACH_PROJECT_DIR/reddit/tracking" \
  "$OUTREACH_PROJECT_DIR/x/auth" \
  "$OUTREACH_PROJECT_DIR/x/output/actions" \
  "$OUTREACH_PROJECT_DIR/x/output/logs" \
  "$OUTREACH_PROJECT_DIR/x/tracking"

cp starter-assets/reddit/config.example.json "$OUTREACH_PROJECT_DIR/reddit/config.json"
cp starter-assets/reddit/templates.example.json "$OUTREACH_PROJECT_DIR/reddit/templates.json"
cp -R starter-assets/reddit/guidance/. "$OUTREACH_PROJECT_DIR/reddit/guidance/"
cp starter-assets/x/config.example.json "$OUTREACH_PROJECT_DIR/x/config.json"
cp starter-assets/x/.env.example "$OUTREACH_PROJECT_DIR/x/.env"
```

Legacy note:

- Older local projects may still have `prompts/`, `data/`, `x-outreach/`, `review_batches/`, or `intended_actions/`.
- New work should use `guidance/`, `auth/`, `x/`, and `output/actions/`.
- If old artifacts must be preserved, archive them consistently:
  - `research/archive/review_batches/`
  - `reddit/output/archive/legacy_intents/`
  - `reddit/output/archive/orphaned_auth/`
  - `x/output/archive/legacy_intents/`

Canonical action roots:

- Reddit: `projects/<slug>/reddit/output/actions/`
- X: `projects/<slug>/x/output/actions/`

Fastest way to inspect queues:

```bash
OUTREACH_PROJECT_DIR="$PWD/projects/<slug>" python -m src.reddit.actions summary
OUTREACH_PROJECT_DIR="$PWD/projects/<slug>" python -m src.reddit.actions list --status approved
OUTREACH_PROJECT_DIR="$PWD/projects/<slug>" python -m src.reddit.actions show-run <run-id>

OUTREACH_PROJECT_DIR="$PWD/projects/<slug>" python -m src.x.actions summary
OUTREACH_PROJECT_DIR="$PWD/projects/<slug>" python -m src.x.actions list --status approved
OUTREACH_PROJECT_DIR="$PWD/projects/<slug>" python -m src.x.actions show-run <run-id>
```
