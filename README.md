<h1 align="center">ii-outreach</h1>

<p align="center">
  Agent-first Reddit and X outreach scaffolding.<br/>
  Turn a product brief into saved guidance, auth, and reviewable action queues.
</p>

<p align="center">
  <a href="https://github.com/intelligent-iterations/ii-outreach/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/intelligent-iterations/ii-outreach/actions/workflows/ci.yml"><img src="https://github.com/intelligent-iterations/ii-outreach/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://discord.gg/G7Qnnhy"><img src="https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://github.com/intelligent-iterations/ii-outreach/issues"><img src="https://img.shields.io/badge/issues-welcome-brightgreen.svg" alt="Issues welcome"></a>
  <a href="https://github.com/intelligent-iterations/ii-outreach/discussions"><img src="https://img.shields.io/badge/discussions-enabled-black.svg" alt="Discussions"></a>
</p>

ii-outreach is an open-source, agent-first outreach engine for Codex and Claude Code. It turns a product brief into reusable Reddit and X strategy, project-scoped auth, and review-first action queues instead of one-off scripts or prompt dumps.

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#community">Community</a> •
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

## What You Get

- A symmetric Reddit + X codebase that agents can navigate quickly
- Gitignored per-project runtime state under `projects/<slug>/`
- Review-first action queues instead of direct-post-by-default automation
- Starter assets and guidance that can be copied into new projects cleanly

## Overview

Outreach keeps the tracked repo reusable and pushes live operator state into gitignored `projects/<slug>/`.

Internal CI and scheduled execution should run through Fleet-managed
self-hosted capacity. Do not add queue-runner profiles, direct host labels, or
persistent host runners for this package.

The repo now has a symmetric platform model:

- Reddit code lives under `src/reddit/`
- X code lives under `src/x/`
- Starter assets live under `starter-assets/`
- Per-project runtime state lives under `projects/<slug>/reddit/` and `projects/<slug>/x/`

## Why This Exists

- Outreach work should be review-first, not “LLM says post this now.”
- Product context should live in durable project state, not vanish into chat.
- Platform auth, run logs, and staged actions should stay local and isolated per project.
- Codex and Claude Code should be able to understand the repo shape quickly and operate it safely.

## Community

- Discord: [Intelligent Iterations Discord](https://discord.gg/G7Qnnhy)
- Issues: [GitHub Issues](https://github.com/intelligent-iterations/ii-outreach/issues)
- Discussions: [GitHub Discussions](https://github.com/intelligent-iterations/ii-outreach/discussions)
- Security: [SECURITY.md](https://github.com/intelligent-iterations/ii-outreach/blob/main/SECURITY.md)

## Project Model

Each product gets one gitignored project folder:

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

Use `workspace/` for durable product context and `research/` for niche notes. Use platform folders for platform-specific config, auth, tracking, and action state.

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements/reddit.txt
pip install -r requirements/x.txt
```

Bootstrap a project:

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

Or start from the tracked scaffold:

```bash
cp -R projects/_template/. "$OUTREACH_PROJECT_DIR"
```

Then ask the operator agent for a real setup, for example:

```text
My product is an ingredient-checking app for health-conscious shoppers.
Target audience is people comparing Yuka, Think Dirty, and clean beauty tools.
Voice should be helpful, specific, low-pressure, and honest that I built it.
Turn this into a Reddit + X outreach setup and stage reviewable actions.
```

## Commands

Reddit:

```bash
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.reddit.setup_auth
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.reddit.main
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.reddit.actions summary
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.reddit.review_ui
```

X:

```bash
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.x.setup_auth
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.x.main --headless
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.x.actions summary
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.x.main --dispatch-approved
```

Default runs are review-first. They stage artifacts instead of posting immediately.

## Action Queues

Canonical action roots:

- Reddit: `projects/<slug>/reddit/output/actions/`
- X: `projects/<slug>/x/output/actions/`

Canonical layout:

```text
output/actions/
  by_status/
    pending_review/
    approved/
    scheduled/
    rejected/
    dispatching/
    dispatched/
    failed/
  by_run/
    <run-id>/
      manifest.json
```

Use the CLI to inspect queues:

```bash
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.reddit.actions list --status approved
OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics" python -m src.x.actions list --status approved
```

## Repo Layout

```text
starter-assets/
  reddit/
  x/

requirements/
  reddit.txt
  x.txt

src/
  reddit/
  x/

tests/
  x/
```

See [projects/README.md](./projects/README.md), [AGENTS.md](./AGENTS.md), and [docs/platforms/x.md](./docs/platforms/x.md) for the repo contract.

## Open Source

- License: [MIT](./LICENSE)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](./SECURITY.md)
