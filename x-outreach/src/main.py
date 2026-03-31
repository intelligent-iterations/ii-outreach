"""Compatibility wrapper for `python -m src.main`."""

import asyncio

from src.app.main import *  # noqa: F401,F403


if __name__ == "__main__":
    asyncio.run(main())
