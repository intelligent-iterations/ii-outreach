# Outreach Agent Rules

This repo is meant to be configured and operated by an agent from a user's product brief.

## Repo Structure

- Repo root contains the shared engine, starter prompts, and starter config examples.
- Per-user and per-project runtime state belongs under gitignored `projects/<slug>/`.
- If a user has not chosen a slug yet, the agent should create one from the product name.
- The active project root should be treated as `projects/<slug>/`.
- Use `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug>` when running onboarding, dry runs, safe-mode runs, or the review UI.

## Primary Goal

Turn plain-English product context into:

- search keywords
- strategy buckets
- outreach templates
- prompt guidance
- Reddit config
- optional X config
- local auth setup
- staged intended actions for review before posting

The operator should be the primary brain for project setup:

- write the templates
- write the prompt guidance
- save tone and moderation assumptions in project state
- prefer local, template-driven discovery and reply adaptation by default
- only use Grok as an optional external scorer if the user explicitly wants that mode

## Required Workflow

When a user describes a product:

1. Create or select a project folder under `projects/<slug>/` with this structure:
   - `workspace/`
   - `prompts/`
   - `data/`
   - `output/`
   - `tracking/`
   - `x-outreach/data/`
2. Update `projects/<slug>/workspace/PRODUCT_PROFILE.md` with:
   - product name
   - one-line summary
   - target audience
   - main pain points
   - value props
   - competitors or substitutes
   - CTA style
3. Update `projects/<slug>/workspace/VOICE_EXAMPLES.md` if the user gives tone examples.
4. Research existing Reddit posts and comments in the relevant niche before writing templates. Save the resulting tone assumptions in project state, not just chat.
5. Check likely target subreddit rules or moderation norms when the workflow could trip self-promo filters.
6. Translate that profile into:
   - `projects/<slug>/config.json`
   - `projects/<slug>/templates.json`
   - `projects/<slug>/prompts/base_system.txt`
   - `projects/<slug>/prompts/triage_v2.txt`
   - `projects/<slug>/prompts/discovery.txt`
   - optional X config in `projects/<slug>/x-outreach/config.json`
7. If the user shares Reddit/X credentials in chat, move them into local ignored project files before running auth:
   - `projects/<slug>/.env`
   - `projects/<slug>/x-outreach/.env`
8. Run onboarding locally with:
   - `OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.setup_auth`
   - `cd x-outreach && OUTREACH_PROJECT_DIR=/abs/path/to/projects/<slug> python -m src.setup_auth`
9. Treat dependency installation as part of onboarding. The onboarding commands should bootstrap their own Python deps before auth.
10. Save fresh cookies/session state under the active project:
   - `projects/<slug>/data/`
   - `projects/<slug>/x-outreach/data/`
11. For posting flows, prefer staging intended actions into `projects/<slug>/output/intended_actions/` rather than posting immediately.
12. Treat the review UI as part of the product surface, not a debugging tool.

## Starter Assets

- Starter config lives at repo root in `config.example.json` and `x-outreach/config.example.json`.
- Starter prompts live at repo root in `prompts/`.
- Starter templates live at repo root in `templates.json`.
- Agents should copy starter assets into the active project folder before tailoring them.
- Do not save an individual contributor's live project setup back into the tracked repo root.

## Messaging Standards

- Keep comments useful even if nobody clicks.
- Default to soft CTAs.
- Avoid hype and invented claims.
- Keep templates reusable and placeholder-driven.
- Match the product's actual voice instead of generic startup copy.
- If the user is promoting their own open-source repo, default to honest maintainer disclosure instead of fake neutrality.

## Keyword Standards

Prefer:

- competitor names
- "alternative to" phrasing
- recommendation intent
- pain-point phrasing
- workflow frustration phrasing
- community-native wording

Avoid:

- spammy broad keywords with no purchase or problem intent
- vague vanity phrases that do not map to a realistic thread

## Safety

- Never keep real cookies, screenshots, logs, or account state in the tracked repo root.
- Never leave real passwords in tracked config.
- Never rely on copied cookies from another repo, machine, or account.
- If you duplicate a runtime repo into this one, sanitize it first.
- Safe mode should be the default execution path unless the user explicitly asks for direct posting.
- If credentials are provided in chat, the agent may use them to populate local ignored files and complete onboarding.
