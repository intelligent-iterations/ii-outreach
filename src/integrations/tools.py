"""
Legacy compatibility layer for old `src.tools` imports.

This repo no longer supports Reddit API tooling. Reddit automation is browser-only
through `zendriver` and the main outreach runtime.
"""


_BROWSER_ONLY_MESSAGE = (
    "Reddit API tooling has been removed. Use the browser automation workflow "
    "(`python -m src.reddit.main`, `python -m src.reddit.dry_run`, or `python -m src.reddit.setup_auth`) "
    "with zendriver instead."
)


def _unsupported(*_args, **_kwargs):
    raise RuntimeError(_BROWSER_ONLY_MESSAGE)


search_reddit = _unsupported
get_thread_info = _unsupported
post_comment = _unsupported
reply_to_comment = _unsupported


def main():
    raise SystemExit(_BROWSER_ONLY_MESSAGE)


if __name__ == "__main__":
    main()
