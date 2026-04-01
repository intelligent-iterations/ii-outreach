# X Outreach

X support now lives inside the main repo under `src/x/`, with per-project runtime state under `projects/<slug>/x/`.

## Source Layout

```text
src/x/
  actions.py
  dispatch_approved.py
  main.py
  setup_auth.py
  platform/  auth, search, reply
  runtime/   state and staged action queue
  shared/    project paths and utilities
```

## Project Layout

```text
projects/<slug>/x/
  .env
  config.json
  auth/
  output/
    actions/
      by_status/
      by_run/
    logs/
  tracking/
```

## Setup

Install dependencies:

```bash
pip install -r requirements/x.txt
```

Bootstrap a project:

```bash
export OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics"
mkdir -p \
  "$OUTREACH_PROJECT_DIR/x/auth" \
  "$OUTREACH_PROJECT_DIR/x/output/actions" \
  "$OUTREACH_PROJECT_DIR/x/output/logs" \
  "$OUTREACH_PROJECT_DIR/x/tracking"
cp starter-assets/x/config.example.json "$OUTREACH_PROJECT_DIR/x/config.json"
cp starter-assets/x/.env.example "$OUTREACH_PROJECT_DIR/x/.env"
```

Credentials can come from:

- `projects/<slug>/x/.env`
- or `projects/<slug>/x/config.json`

Onboard local cookies:

```bash
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.setup_auth
```

## Usage

```bash
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.main --dry-run
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.main --headless
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.main --account your_handle
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.main --dispatch-approved
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.main --live-post
```

Default runs stage reviewable actions into:

`projects/<slug>/x/output/actions/by_status/pending_review/`

Inspect them with:

```bash
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.actions summary
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.actions list --status pending_review
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.actions list --status approved
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.x.actions show-run <run-id>
```
