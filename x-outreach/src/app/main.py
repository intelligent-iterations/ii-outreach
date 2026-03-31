#!/usr/bin/env python3
"""
X/Twitter Outreach Bot

Browser automation for searching posts and making relevant replies.
Uses zendriver for Chrome automation.

Usage:
    python -m src.main                    # Run with default config
    python -m src.main --headless         # Run headless
    python -m src.main --dry-run          # Search only, no replies
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime

from src.platform.auth import login, nuclear_tab_reset
from src.platform.search import search_posts, search_posts_advanced
from src.platform.reply import reply_to_tweet, quote_tweet, check_rate_limit
from src.shared.utils import log, load_config, random_delay, BASE_DIR


async def run_outreach(config, account, headless=False, dry_run=False):
    """Run outreach for a single account."""
    log.header(f"X OUTREACH - @{account['username']}")

    # Login
    log.subheader("Authentication")
    browser, page = await login(config, account, headless=headless)

    if not browser or not page:
        log.error("Failed to login")
        return {"replies_sent": 0, "replies_failed": 0}

    stats = {"replies_sent": 0, "replies_failed": 0, "posts_found": 0}

    try:
        # Process each keyword/strategy
        for raw_strategy in config.get("strategies", []):
            strategy = {**raw_strategy, "product": config.get("product", {})}
            log.subheader(f"Strategy: {strategy['name']}")

            keywords = strategy.get("keywords", [])
            reply_template = strategy.get("reply_template", "")
            filters = strategy.get("filters", {})
            max_replies = strategy.get("max_replies_per_keyword", 5)

            for keyword in keywords:
                log.step("🔍", f"Searching: {keyword}")

                # Search for posts
                if filters:
                    posts = await search_posts_advanced(
                        page, keyword, config,
                        max_results=max_replies * 2,  # Get extra in case some fail
                        filters=filters
                    )
                else:
                    posts = await search_posts(
                        page, keyword, config,
                        max_results=max_replies * 2
                    )

                stats["posts_found"] += len(posts)
                log.post_table(posts)

                if dry_run:
                    log.info("DRY RUN - skipping replies")
                    continue

                # Reply to posts
                replies_for_keyword = 0
                for post in posts:
                    if replies_for_keyword >= max_replies:
                        break

                    # Skip if keyword not confirmed in text
                    if not post.get("keyword_confirmed", False):
                        log.step("⏭️", f"Skipping - keyword not in text: @{post['username']}")
                        continue

                    # Generate reply (simple template substitution for now)
                    reply_text = _generate_reply(reply_template, post, strategy)

                    if not reply_text:
                        log.warning(f"No reply generated for @{post['username']}")
                        continue

                    # Check rate limit before replying
                    if await check_rate_limit(page):
                        log.warning("Rate limited - stopping replies for this keyword")
                        break

                    # Post the reply
                    log.action("reply", f"@{post['username']}")
                    success, page = await reply_to_tweet(
                        browser, page, post["url"], reply_text, config
                    )

                    if success:
                        stats["replies_sent"] += 1
                        replies_for_keyword += 1
                        log.action("reply", f"@{post['username']}", "success")

                        # Log the action
                        _log_action(account, post, reply_text, "reply", True)
                    else:
                        stats["replies_failed"] += 1
                        log.action("reply", f"@{post['username']}", "failed")
                        _log_action(account, post, reply_text, "reply", False)

                    # Delay between replies
                    delay = await random_delay(
                        config["delays"]["between_actions_min_seconds"],
                        config["delays"]["between_actions_max_seconds"]
                    )
                    log.wait(delay, "between replies")

                # Delay between keywords
                await random_delay(5, 15)

    except Exception as e:
        log.error(f"Outreach error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        # Cleanup
        try:
            await browser.stop()
        except Exception:
            pass

    log.final_summary(stats["replies_sent"], stats["replies_failed"])
    return stats


def _generate_reply(template, post, strategy):
    """Generate a reply from template and post context."""
    if not template:
        return None

    reply = template
    product = strategy.get("product", {}) or {}

    # Simple variable substitution
    reply = reply.replace("{username}", post.get("username", ""))
    reply = reply.replace("{keyword}", post.get("keyword", ""))
    reply = reply.replace("{product_name}", product.get("name", "your product"))
    reply = reply.replace("{product_url}", product.get("url", ""))
    reply = reply.replace("{value_prop}", product.get("value_prop", product.get("summary", "")))

    # Trim to X's character limit (280 chars)
    if len(reply) > 280:
        reply = reply[:277] + "..."

    return reply


def _log_action(account, post, text, action_type, success):
    """Log an action to the run data file."""
    log_file = os.path.join(BASE_DIR, "data", "actions.jsonl")

    entry = {
        "timestamp": datetime.now().isoformat(),
        "account": account["username"],
        "action": action_type,
        "target_user": post.get("username"),
        "target_url": post.get("url"),
        "text": text[:100],
        "success": success,
    }

    try:
        with open(log_file, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        log.warning(f"Failed to log action: {e}")


async def main():
    parser = argparse.ArgumentParser(description="X/Twitter Outreach Bot")
    parser.add_argument("--headless", action="store_true", help="Run in headless mode")
    parser.add_argument("--dry-run", action="store_true", help="Search only, no replies")
    parser.add_argument("--account", type=str, help="Run specific account only")
    args = parser.parse_args()

    log.header("X OUTREACH BOT")
    log.info(f"Mode: {'headless' if args.headless else 'visible'}")
    log.info(f"Dry run: {args.dry_run}")

    # Load config
    config = load_config()

    # Run for each account
    accounts = config.get("accounts", [])

    if args.account:
        accounts = [a for a in accounts if a["username"] == args.account]
        if not accounts:
            log.error(f"Account '{args.account}' not found in config")
            sys.exit(1)

    total_stats = {"replies_sent": 0, "replies_failed": 0}

    for account in accounts:
        stats = await run_outreach(
            config, account,
            headless=args.headless,
            dry_run=args.dry_run
        )
        total_stats["replies_sent"] += stats["replies_sent"]
        total_stats["replies_failed"] += stats["replies_failed"]

        # Delay between accounts
        if len(accounts) > 1:
            await random_delay(30, 60)

    log.header("FINAL RESULTS")
    log.final_summary(total_stats["replies_sent"], total_stats["replies_failed"])


if __name__ == "__main__":
    asyncio.run(main())
