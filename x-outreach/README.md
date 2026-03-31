# X Outreach

Agent-run X outreach for finding and replying to relevant conversations about your product category.

Per-project X config should live under gitignored `projects/<slug>/x-outreach/`, with `OUTREACH_PROJECT_DIR` pointing at the parent project root.

Source layout:

```text
x-outreach/src/
  app/       CLI entrypoints
  platform/  X auth, search, and reply modules
  runtime/   state tracking
  shared/    project paths and shared utilities
  main.py    compatibility wrapper
  setup_auth.py compatibility wrapper
```

## Setup

### Installation

```bash
cd x-outreach
pip install -r requirements.txt
```

### Configuration

```bash
export OUTREACH_PROJECT_DIR="$PWD/../projects/acme-analytics"
mkdir -p "$OUTREACH_PROJECT_DIR/x-outreach/data"
cp config.example.json "$OUTREACH_PROJECT_DIR/x-outreach/config.json"
```

Then tailor `projects/<slug>/x-outreach/config.json` to your product, keyword strategy, and voice.

Credentials can come from:

- `X_USERNAME` / `X_PASSWORD` in `projects/<slug>/x-outreach/.env`
- or `accounts[]` in `projects/<slug>/x-outreach/config.json`

Onboard local cookies before running live replies:

```bash
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.setup_auth
```

That onboarding command also installs this module's Python dependencies before opening the login flow.

## Usage

```bash
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.main --dry-run
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.main --headless
OUTREACH_PROJECT_DIR="$OUTREACH_PROJECT_DIR" python -m src.main --account your_handle
```

## Config Shape

The X module expects:

- `product.name`
- `product.url`
- `product.summary`
- `product.value_prop`
- `strategies[].keywords`
- `strategies[].reply_template`

The reply template can use:

- `{username}`
- `{keyword}`
- `{product_name}`
- `{product_url}`
- `{value_prop}`

Cookies, screenshots, and run outputs should stay local in gitignored `projects/<slug>/x-outreach/data/`.
