#!/usr/bin/env python3
"""
X/Twitter Outreach Bot

Browser automation for searching posts and staging relevant replies.
Uses zendriver for Chrome automation.

Usage:
    python -m src.x.main                  # Stage reviewable actions
    python -m src.x.main --headless       # Stage reviewable actions headlessly
    python -m src.x.main --dry-run        # Search only, no staging or replies
    python -m src.x.main --live-post      # Bypass review and reply immediately
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime

from src.x.platform.auth import login
from src.x.platform.search import search_posts, search_posts_advanced
from src.x.platform.reply import reply_to_tweet, check_rate_limit
from src.x.runtime.review_queue import has_active_tweet_action, has_active_user_action, stage_action
from src.x.shared.utils import log, load_config, random_delay, BASE_DIR
from src.x.dispatch_approved import dispatch_approved_actions


def _new_run_id(account_name: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    safe_account = "".join(ch if ch.isalnum() else "-" for ch in account_name.lower()).strip("-") or "account"
    return f"x-{timestamp}-{safe_account}"


def _build_staged_reply_payload(account: dict, strategy: dict, post: dict, reply_text: str) -> dict:
    return {
        "account": account["username"],
        "strategy": strategy.get("name", ""),
        "action_type": "reply",
        "status": "pending_review",
        "username": post.get("username", ""),
        "tweet_id": post.get("tweet_id", ""),
        "tweet_url": post.get("url", ""),
        "keyword": post.get("keyword", ""),
        "message": reply_text,
        "target_text": post.get("text", ""),
        "target_metrics": {
            "likes": post.get("likes", 0),
            "retweets": post.get("retweets", 0),
            "replies": post.get("replies", 0),
        },
    }


async def run_outreach(config, account, run_id: str, headless=False, dry_run=False, live_post=False):
    """Run outreach for a single account."""
    log.header(f"X OUTREACH - @{account['username']}")

    # Login
    log.subheader("Authentication")
    browser, page = await login(config, account, headless=headless)

    if not browser or not page:
        log.error("Failed to login")
        return {"replies_sent": 0, "replies_failed": 0}

    stats = {
        "replies_sent": 0,
        "replies_failed": 0,
        "posts_found": 0,
        "staged": 0,
        "skipped_duplicates": 0,
    }

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
                    log.info("DRY RUN - skipping staging and replies")
                    continue

                # Stage or post replies
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

                    if has_active_tweet_action(post.get("tweet_id", "")) or has_active_user_action(post.get("username", "")):
                        stats["skipped_duplicates"] += 1
                        log.action("reply", f"@{post['username']}", "skipped")
                        continue

                    if not live_post:
                        staged = stage_action(
                            run_id,
                            _build_staged_reply_payload(account, strategy, post, reply_text),
                        )
                        stats["staged"] += 1
                        replies_for_keyword += 1
                        log.success(
                            f"Staged reply for @{post['username']} -> "
                            f"{os.path.relpath(staged['_path'], BASE_DIR)}"
                        )
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

    if not dry_run and not live_post:
        log.subheader("Staging Summary")
        log.stat("Run ID", run_id)
        log.stat("Replies staged", stats["staged"], log.GREEN)
        log.stat("Duplicates skipped", stats["skipped_duplicates"], log.YELLOW)

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
    log_file = os.path.join(BASE_DIR, "output", "logs", "actions.jsonl")
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

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
    parser.add_argument("--dry-run", action="store_true", help="Search only, no staging or replies")
    parser.add_argument("--live-post", action="store_true", help="Bypass review and reply immediately")
    parser.add_argument("--dispatch-approved", action="store_true", help="Dispatch approved staged X actions")
    parser.add_argument("--account", type=str, help="Run specific account only")
    args = parser.parse_args()

    log.header("X OUTREACH BOT")
    log.info(f"Mode: {'headless' if args.headless else 'visible'}")
    log.info(f"Dry run: {args.dry_run}")
    log.info(f"Live post: {args.live_post}")

    # Load config
    config = load_config()

    # Run for each account
    accounts = config.get("accounts", [])

    if args.account:
        accounts = [a for a in accounts if a["username"] == args.account]
        if not accounts:
            log.error(f"Account '{args.account}' not found in config")
            sys.exit(1)

    if args.dispatch_approved:
        await dispatch_approved_actions(only_account=args.account)
        return

    total_stats = {"replies_sent": 0, "replies_failed": 0}

    for account in accounts:
        run_id = _new_run_id(account["username"])
        stats = await run_outreach(
            config, account,
            run_id=run_id,
            headless=args.headless,
            dry_run=args.dry_run,
            live_post=args.live_post,
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
