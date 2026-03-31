# Projects

Put local project setups under `projects/<slug>/`.

This directory is gitignored on purpose so each clone can keep its own product state, credentials, cookies, outputs, and review artifacts without leaking contributor-specific setup into the repo.

Recommended project structure:

```text
projects/<slug>/
  .env
  config.json
  templates.json
  prompts/
    base_system.txt
    triage_v2.txt
    discovery.txt
    competitor_alternative.txt
    problem_aware.txt
  workspace/
    PRODUCT_PROFILE.md
    VOICE_EXAMPLES.md
  data/
  output/
  tracking/
  x-outreach/
    .env
    config.json
    data/
```

Example bootstrap from the repo root:

```bash
export OUTREACH_PROJECT_DIR="$PWD/projects/acme-analytics"

mkdir -p \
  "$OUTREACH_PROJECT_DIR/workspace" \
  "$OUTREACH_PROJECT_DIR/prompts" \
  "$OUTREACH_PROJECT_DIR/data" \
  "$OUTREACH_PROJECT_DIR/output" \
  "$OUTREACH_PROJECT_DIR/tracking" \
  "$OUTREACH_PROJECT_DIR/x-outreach/data"

cp config.example.json "$OUTREACH_PROJECT_DIR/config.json"
cp templates.json "$OUTREACH_PROJECT_DIR/templates.json"
cp -R prompts/. "$OUTREACH_PROJECT_DIR/prompts/"
cp x-outreach/config.example.json "$OUTREACH_PROJECT_DIR/x-outreach/config.json"
```

Then run the bots with `OUTREACH_PROJECT_DIR` set to that project root.
