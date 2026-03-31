"""Compatibility wrapper for `python -m src.dry_run`."""

from src.app.dry_run import *  # noqa: F401,F403


if __name__ == "__main__":
    main()
