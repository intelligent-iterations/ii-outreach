# Contributing

Thanks for contributing to `ii-outreach`.

## Before Opening A PR

1. Read [README.md](./README.md), [AGENTS.md](./AGENTS.md), and [projects/README.md](./projects/README.md).
2. Keep the tracked repo generic. Do not commit live project state from `projects/<slug>/`.
3. Preserve the review-first model. New posting flows should stage actions before dispatch.
4. Update docs when you change the repo contract or project layout.

## Development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements/reddit.txt
pip install -r requirements/x.txt
```

Run tests:

```bash
./.venv/bin/python -m unittest tests.test_actions_cli tests.test_review_queue tests.test_project_paths tests.test_browser_cookies tests.x.test_actions_cli tests.x.test_main tests.x.test_project_paths tests.x.test_search tests.x.test_browser_cookies
```

## Pull Request Expectations

- Keep changes focused.
- Prefer explicit naming over “misc” or “data”-style folders.
- Do not reintroduce legacy paths like `x-outreach/`, `prompts/`, `data/`, or `output/intended_actions/`.
- Add or update tests when behavior changes.
- Include doc updates for user-facing or operator-facing changes.
