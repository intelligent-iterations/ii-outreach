"""Compatibility wrapper for `python -m src.review_ui`."""

from src.app.review_ui import *  # noqa: F401,F403


if __name__ == "__main__":
    main()
