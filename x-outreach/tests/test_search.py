#!/usr/bin/env python3
"""
Quick test script to verify X search works.

Usage:
    python test_search.py "your search term"
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.platform.auth import login
from src.platform.search import search_posts
from src.shared.utils import log, load_config


async def main():
    if len(sys.argv) < 2:
        print("Usage: python test_search.py \"search term\"")
        sys.exit(1)

    keyword = sys.argv[1]

    log.header(f"X SEARCH TEST: {keyword}")

    config = load_config()
    account = config["accounts"][0]

    log.subheader("Logging in...")
    browser, page = await login(config, account, headless=False)

    log.subheader(f"Searching for: {keyword}")
    posts = await search_posts(page, keyword, config, max_results=10)

    log.subheader("Results")
    log.post_table(posts, max_show=10)

    for i, post in enumerate(posts[:5]):
        print(f"\n--- Post {i+1} ---")
        print(f"@{post['username']}: {post['text'][:200]}")
        print(f"URL: {post['url']}")
        print(f"Likes: {post['likes']} | Retweets: {post['retweets']}")

    input("\nPress ENTER to close browser...")

    await browser.stop()


if __name__ == "__main__":
    asyncio.run(main())
