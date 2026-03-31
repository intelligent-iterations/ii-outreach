"""Compatibility wrapper for `python -m src.tools` and direct imports."""

from src.integrations.tools import *  # noqa: F401,F403


if __name__ == "__main__":
    main()
