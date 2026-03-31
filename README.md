<h1 align="center">Outreach</h1>

<p align="center">
  Agent-first Reddit and X outreach scaffolding.<br/>
  Turn a product brief into saved research, voice, templates, auth, and reviewable posting intent.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/docker-browser--automation-2496ED?logo=docker&logoColor=white" alt="Docker browser automation" />
  <img src="https://img.shields.io/badge/platforms-reddit%20%7C%20x-111111" alt="Platforms Reddit and X" />
  <img src="https://img.shields.io/badge/model-agent--first-0A7E3F" alt="Agent first" />
</p>

---

Outreach is the repo you open when you do not want "outreach" to mean another spreadsheet, another prompt dump, and another pile of one-off manual replies.

The shared repo stays clean. Real operator state lives under gitignored `projects/<slug>/`. That means each clone gets reusable code and docs, while product research, auth, cookies, staged actions, and outputs stay local.

The operator is the brain. Codex or Claude writes the project state, then the runtime uses that saved state to find leads, choose a reply shape, and stage intended actions before anything is posted.

## What It Does

- turns a product brief into reusable Reddit and X strategy
- saves product research and voice in repo-local project state
- generates keywords, strategy buckets, templates, and prompt files
- onboards browser auth locally with saved cookies per project
- stages intended actions for review before dispatch

## Project Model

Use one gitignored project folder per promoted product:

```text
projects/<slug>/
  .env
  config.json
  templates.json
  prompts/
  workspace/
  data/
  output/
  tracking/
  x-outreach/
    .env
    config.json
    data/
    output/
```

See [projects/README.md](/Users/admin/outreach/projects/README.md) for the bootstrap shape.

## Workflow

1. Create or select `projects/<slug>/`
2. Save the product brief in `workspace/PRODUCT_PROFILE.md`
3. Save voice examples and research notes in the project workspace
4. Generate project config, prompts, and templates
5. Run onboarding locally for Reddit and optional X
6. Run safe mode and review staged actions
7. Approve or reject before dispatch

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r x-outreach/requirements.txt
```

Create a project:

```bash
export OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics"

mkdir -p \
  "$OUTREACH_PROJECT_DIR/workspace" \
  "$OUTREACH_PROJECT_DIR/prompts" \
  "$OUTREACH_PROJECT_DIR/data" \
  "$OUTREACH_PROJECT_DIR/output" \
  "$OUTREACH_PROJECT_DIR/tracking" \
  "$OUTREACH_PROJECT_DIR/x-outreach/data" \
  "$OUTREACH_PROJECT_DIR/x-outreach/output"

cp config.example.json "$OUTREACH_PROJECT_DIR/config.json"
cp templates.json "$OUTREACH_PROJECT_DIR/templates.json"
cp -R prompts/. "$OUTREACH_PROJECT_DIR/prompts/"
cp x-outreach/config.example.json "$OUTREACH_PROJECT_DIR/x-outreach/config.json"
```

Then ask the agent for something like:

```text
My product is an ingredient-checking app for health-conscious shoppers.
Target audience is people comparing Yuka, Think Dirty, and clean beauty tools.
Voice should be helpful, specific, low-pressure, and honest that I built it.
Turn this into a Reddit + X outreach setup and stage reviewable actions.
```

## Docker

The repo includes a browser-automation container for Chromium + `zendriver`.

Default resource floor:

- `2 vCPU`
- `4 GB RAM`
- `1 GB /dev/shm`

Recommended:

```bash
export OUTREACH_CPUS=4
export OUTREACH_MEM_LIMIT=8g
export OUTREACH_SHM_SIZE=1gb
```

Build:

```bash
docker compose build
```

Set the active project slug:

```bash
export OUTREACH_PROJECT_SLUG=acme-analytics
```

Reddit onboarding:

```bash
docker compose run --rm outreach python -m src.setup_auth
```

Reddit safe mode:

```bash
docker compose run --rm outreach python -m src.main
```

Review UI:

```bash
docker compose run --rm --service-ports outreach python -m src.review_ui --host 0.0.0.0
```

X onboarding:

```bash
docker compose run --rm x-outreach python -m src.setup_auth
```

X dry run:

```bash
docker compose run --rm x-outreach python -m src.main --headless --dry-run
```

## Safe-Mode Model

This repo separates generation from posting.

- product and strategy state are saved under the active project
- local browser cookies are reused from that project only
- safe mode stages JSON action artifacts before dispatch
- approval is a separate step from discovery

Reddit staged actions are written under:

`projects/<slug>/output/intended_actions/<run-id>/`

X staged actions are written under:

`projects/<slug>/x-outreach/output/intended_actions/<run-id>/`

## Repo Layout

```text
src/
  app/         CLI entrypoints and top-level Reddit workflows
  decision/    template selection, discovery, and triage
  integrations/ operator-facing helper integrations
  reddit/      Reddit auth, search, comments, DMs
  runtime/     models, state, logs, review queue
  shared/      project paths, config loading, utilities

x-outreach/src/
  app/         X entrypoints
  platform/    X auth, search, reply
  runtime/     X state and staged action queue
  shared/      X project path and utility helpers
```

For a fuller map, see [REPO_STRUCTURE.md](/Users/admin/outreach/REPO_STRUCTURE.md).

## Security

This repo is only safe to publish if the trust boundary stays intact:

- shared scaffolding belongs in git
- live project state stays under gitignored `projects/<slug>/`
- credentials should prefer per-project `.env`
- cookies, screenshots, logs, and review artifacts stay local

Read [SECURITY.md](/Users/admin/outreach/SECURITY.md) and the audit at [docs/SECURITY_AUDIT.md](/Users/admin/outreach/docs/SECURITY_AUDIT.md).

## Key Docs

- [AGENTS.md](/Users/admin/outreach/AGENTS.md)
- [CLAUDE.md](/Users/admin/outreach/CLAUDE.md)
- [projects/README.md](/Users/admin/outreach/projects/README.md)
- [REPO_STRUCTURE.md](/Users/admin/outreach/REPO_STRUCTURE.md)

## Runtime Commands

Normal runs default to safe mode.

```bash
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.main
```

That stages intended actions under `projects/<slug>/output/intended_actions/` instead of posting them immediately.

Start the review UI:

```bash
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.review_ui
```

Then open `http://127.0.0.1:8787`, approve or reject staged items, and use the UI's `Dispatch Approved` button when you want the approved actions sent.

If you explicitly want immediate posting and want to bypass review:

```bash
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.main --live-post
```

## X Usage

```bash
export OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics"
cd x-outreach
python -m src.setup_auth
python -m src.main --dry-run
```

## Notes

- The tracked repo only contains shared engine code and starter assets.
- Real projects should live under gitignored `projects/`.
- Runtime cookies, screenshots, logs, outputs, and review artifacts should stay out of version control.
- The repo becomes useful only after the agent tailors it to a real product and voice.
- Safe mode is the default because review is part of the intended workflow, not an afterthought.
