"""Compatibility wrapper for `python -m src.setup_auth`."""

import asyncio

from src.app.setup_auth import *  # noqa: F401,F403


if __name__ == "__main__":
    asyncio.run(main())
