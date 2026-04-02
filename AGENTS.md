# Outreach Agent Rules

This repo is a reusable outreach engine. Live project state belongs under gitignored `projects/<slug>/`, not in tracked root files.

## Canonical Repo Shape

- Shared code lives under `src/`
  - Reddit implementation: `src/reddit/`
  - X implementation: `src/x/`
- Starter assets live under `starter-assets/`
- Python dependency lists live under `requirements/`
- Per-project runtime state lives under `projects/<slug>/`

## Canonical Project Shape

Treat `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug>` as the active project root.

Create or maintain this layout:

```text
projects/<slug>/
  workspace/
    PRODUCT_PROFILE.md
    VOICE_EXAMPLES.md
  research/
  reddit/
    .env
    config.json
    templates.json
    guidance/
    auth/
    output/
      actions/
        by_status/
        by_run/
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
      logs/
    tracking/
```

Use clear folder names:

- `guidance/` instead of `prompts/`
- `auth/` instead of `data/` for cookies and login artifacts
- `tracking/` for state files
- `output/actions/` for staged intent
- `output/logs/` for screenshots and run logs

Do not introduce new vague folders like `data/`, `review_batches/`, or `intended_actions/`.

## Primary Goal

Turn a product brief into:

- saved product context
- saved tone and moderation assumptions
- reusable Reddit and optional X config
- reusable templates and guidance
- local auth setup
- reviewable staged actions

The operator is the primary brain:

- write the templates
- write the guidance
- save decisions in project state
- prefer local/operator logic by default
- use Grok only if the active project explicitly enables it
- personally decide approval vs rejection on drafted actions
- personally revise weak wording before anything is queued for posting

Local discovery and drafting can help generate candidates, but they do not have final approval authority. Final approval comes from the operator agent.

## Agent Approval Loop

The required posting workflow for the agent is:

1. Find at least 20 candidate leads for the active platform.
2. Review them one by one using the agent's own judgment.
3. Reject anything irrelevant, generic, weak, tone-mismatched, or low-context.
4. Reconsider and rewrite the wording for anything worth keeping.
5. Queue only the final operator-approved draft for posting.
6. Check the queued count.
7. If there are not yet more than 20 queued actions, go find more leads and repeat the loop.

Do not stop just because 20 raw leads were found. The stopping condition is an actually approved queue of more than 20 actions. If 20 candidates produce only 1 acceptable queued post, the agent must continue searching, reviewing, rewriting, and filtering until the queue target is met.

Do not let coarse local triage, template matching, or first-pass heuristics act as the final approval gate. They may suggest candidates, but the operator agent must make the final keep/reject decision.

## Required Workflow

When a user describes a product:

1. Create or select `projects/<slug>/`.
2. Save product context in `projects/<slug>/workspace/PRODUCT_PROFILE.md`.
3. Save tone examples in `projects/<slug>/workspace/VOICE_EXAMPLES.md` when provided.
4. Research the niche before writing templates. Save useful findings under `projects/<slug>/research/`.
5. Check subreddit rules or moderation norms when self-promo risk is real.
6. Translate that profile into:
   - `projects/<slug>/reddit/config.json`
   - `projects/<slug>/reddit/templates.json`
   - `projects/<slug>/reddit/guidance/base_system.md`
   - `projects/<slug>/reddit/guidance/triage_v2.md`
   - `projects/<slug>/reddit/guidance/discovery.md`
   - optional `projects/<slug>/x/config.json`
7. If the user shares credentials in chat, move them into local ignored files before auth:
   - `projects/<slug>/reddit/.env`
   - `projects/<slug>/x/.env`
8. Run onboarding locally:
   - `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.reddit.setup_auth`
   - `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.x.setup_auth`
9. Treat dependency installation as part of onboarding. Setup commands should bootstrap their own requirements.
10. Save fresh cookies under:
   - `projects/<slug>/reddit/auth/`
   - `projects/<slug>/x/auth/`
11. Save runtime state under:
   - `projects/<slug>/reddit/tracking/`
   - `projects/<slug>/x/tracking/`
12. Stage reviewable actions under:
   - `projects/<slug>/reddit/output/actions/`
   - `projects/<slug>/x/output/actions/`
13. Use the canonical action layout:
   - `by_status/pending_review/`
   - `by_status/approved/`
   - `by_status/rejected/`
   - `by_status/dispatching/`
   - `by_status/dispatched/`
   - `by_status/failed/`
   - `by_status/scheduled/` for Reddit
   - `by_run/<run-id>/manifest.json`
14. Prefer CLI inspection before manual folder spelunking:
   - `python -m src.reddit.actions summary`
   - `python -m src.reddit.actions list --status approved`
   - `python -m src.reddit.actions show-run <run-id>`
   - `python -m src.x.actions summary`
15. For lead generation and queue building, use the agent approval loop:
   - find candidate leads
   - personally review relevance
   - rewrite final wording
   - queue only approved drafts
   - repeat until the platform has more than 20 queued actions
16. Safe mode is the default. Stage first, then approve, then dispatch.

## Starter Assets

- Reddit starter assets:
  - `starter-assets/reddit/config.example.json`
  - `starter-assets/reddit/templates.example.json`
  - `starter-assets/reddit/guidance/`
- X starter assets:
  - `starter-assets/x/config.example.json`
  - `starter-assets/x/.env.example`

Copy starter assets into the active project and tailor them there. Do not write live project state back into tracked starter files.

## Messaging Standards

- Keep comments useful even if nobody clicks.
- Default to soft CTAs.
- Avoid hype and invented claims.
- Keep templates reusable and placeholder-driven.
- Match the product's actual voice.
- If the product is the user's own open-source repo, default to honest maintainer disclosure.
- Before queueing, rewrite drafts so they answer the specific target instead of sounding like reusable boilerplate.

## Keyword Standards

Prefer:

- competitor names
- "alternative to" phrasing
- recommendation intent
- pain-point phrasing
- workflow frustration phrasing
- community-native wording

Avoid:

- spammy broad keywords with no problem intent
- vanity phrases that do not map to realistic threads

## Safety

- Never keep real cookies, screenshots, logs, or account state in the tracked repo root.
- Never leave real passwords in tracked config.
- Never reuse cookies from another machine or another repo.
- Safe mode should be the default unless the user explicitly asks for direct posting.
- If credentials are provided in chat, the agent may place them into ignored local files and complete onboarding.
