"""Compatibility wrapper for `python -m src.main`."""

from src.app.main import *  # noqa: F401,F403


if __name__ == "__main__":
    main()
