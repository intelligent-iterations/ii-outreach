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
import re
import sys
from datetime import datetime

from src.x.dispatch_approved import dispatch_approved_actions, schedule_approved_actions
from src.x.platform.auth import login
from src.x.platform.reply import check_rate_limit, reply_to_tweet
from src.x.platform.search import search_posts, search_posts_advanced
from src.x.runtime.review_queue import (
    ACTIVE_STATUSES,
    has_active_tweet_action,
    has_active_user_action,
    list_actions,
    stage_action,
)
from src.x.shared.utils import BASE_DIR, load_config, log, random_delay


PROMO_MARKERS = (
    "i built ",
    "we built ",
    "my tool",
    "our tool",
    "just launched",
    "now listed",
    "listed as an alternative",
    "i reviewed",
    "reviewed http",
    "new plugin",
    "free tool:",
    "grab the workflow",
    "open sourced",
    "open-sourced",
)
REQUEST_MARKERS = (
    "looking for",
    "need a",
    "need an",
    "any recommendations",
    "recommend",
    "any tool",
    "anyone know",
    "what do you use",
    "how do you",
    "alternative",
    "better than",
    "switching from",
    "moving away from",
)
PAIN_MARKERS = (
    "manual",
    "frustrating",
    "annoying",
    "pain",
    "stuck",
    "slow",
    "expensive",
    "too expensive",
    "waste of time",
    "burns runway",
    "doesn't work",
    "not working",
)

# Agent workflow contract for staged X runs:
# 1. Find 20 candidate leads.
# 2. Filter them locally using agent judgment.
# 3. Reconsider the wording for the survivors.
# 4. Queue the final drafts.
# 5. Repeat until the active review/scheduled queue is over 20 items.
#
# This is intentionally hardcoded here so the workflow does not depend on
# per-project config, an external API, or prompt-side tuning.
TARGET_ACTIVE_QUEUE_SIZE = 21
CANDIDATE_BATCH_SIZE = 20
SEARCH_RESULTS_PER_KEYWORD = 40
MAX_SEARCH_CYCLES_PER_STRATEGY = 12


def _new_run_id(account_name: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    safe_account = "".join(ch if ch.isalnum() else "-" for ch in account_name.lower()).strip("-") or "account"
    return f"x-{timestamp}-{safe_account}"


def _build_staged_reply_payload(
    account: dict,
    strategy: dict,
    post: dict,
    reply_text: str,
    relevance_reason: str | None = None,
    relevance_score: int | None = None,
    revision_notes: list[str] | None = None,
) -> dict:
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
        "review_context": {
            "relevance_reason": relevance_reason,
            "relevance_score": relevance_score,
            "revision_notes": revision_notes or [],
        },
    }


def _normalized_terms(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(token) >= 3
    }


def _clean_keyword(keyword: str) -> str:
    tokens = []
    for token in (keyword or "").replace('"', "").split():
        lowered = token.lower()
        if lowered.startswith("lang:") or lowered.startswith("min_") or lowered.startswith("-filter:"):
            continue
        tokens.append(token)
    return " ".join(tokens).strip() or (keyword or "")


def _active_queue_count(account_username: str | None = None) -> int:
    actions = list_actions(ACTIVE_STATUSES)
    if account_username:
        actions = [action for action in actions if action.get("account", "").lower() == account_username.lower()]
    return len(actions)


def _looks_like_promo_pile_on(text: str) -> bool:
    lowered = (text or "").lower()
    if any(marker in lowered for marker in PROMO_MARKERS):
        return True

    has_link = "http://" in lowered or "https://" in lowered or "github.com" in lowered
    has_request = "?" in lowered or any(marker in lowered for marker in REQUEST_MARKERS)
    if has_link and not has_request:
        return True

    return False


def _local_relevance_assessment(post: dict, strategy: dict) -> tuple[bool, int, str]:
    username = (post.get("username", "") or "").lower()
    if username.endswith("bot") or username in {"", "[deleted]", "deleted"}:
        return False, 0, "low-signal account"

    text = (post.get("text", "") or "").strip()
    lowered = text.lower()
    has_explicit_request = "?" in lowered or any(marker in lowered for marker in REQUEST_MARKERS)
    if len(text) < 24 and not has_explicit_request:
        return False, 0, "not enough context to answer well"
    if _looks_like_promo_pile_on(lowered):
        return False, 0, "looks like another builder promo or link drop"

    strategy_terms = _normalized_terms(" ".join(strategy.get("keywords", [])))
    overlap = strategy_terms.intersection(_normalized_terms(text))
    score = 0
    reasons: list[str] = []

    if post.get("keyword_confirmed"):
        score += 3
        reasons.append("keyword confirmed in the post text")

    if overlap:
        score += 1
        reasons.append(f"strategy term overlap: {', '.join(sorted(list(overlap))[:3])}")

    if any(marker in lowered for marker in REQUEST_MARKERS):
        score += 2
        reasons.append("clear ask, comparison, or recommendation intent")

    if any(marker in lowered for marker in PAIN_MARKERS):
        score += 1
        reasons.append("workflow pain is explicit")

    if "?" in text:
        score += 1
        reasons.append("written as a question")

    if len(text) >= 80:
        score += 1
        reasons.append("enough context to write a specific reply")

    if score < 3:
        return False, score, "weak fit after local relevance review"

    return True, score, "; ".join(reasons)


def _candidate_sort_key(post: dict) -> tuple[int, int, int, int]:
    return (
        int(post.get("relevance_score", 0)),
        int(post.get("replies", 0)),
        int(post.get("likes", 0)),
        len(post.get("text", "") or ""),
    )


def _detect_intent(text: str) -> str:
    lowered = (text or "").lower()
    if any(marker in lowered for marker in ("alternative", "better than", "switching from", "moving away from")):
        return "comparison"
    if any(marker in lowered for marker in REQUEST_MARKERS) or "?" in lowered:
        return "request"
    if any(marker in lowered for marker in PAIN_MARKERS):
        return "pain"
    return "general"


def _truncate_reply(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if len(cleaned) <= 280:
        return cleaned
    return cleaned[:277].rstrip() + "..."


def _reconsider_reply(reply_text: str | None, post: dict, strategy: dict) -> tuple[str | None, list[str]]:
    if not reply_text:
        return None, []

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", reply_text.strip()) if part.strip()]
    lowered_sentences = [sentence.lower() for sentence in sentences]
    cta = ""

    if sentences and any(token in lowered_sentences[-1] for token in ("share", "repo", "link", "helpful", "useful")):
        cta = sentences.pop()

    product = strategy.get("product", {}) or {}
    product_name = product.get("name", "your product")
    value_prop = product.get("value_prop", product.get("summary", "")).strip()
    intent = _detect_intent(post.get("text", ""))
    notes: list[str] = []

    if intent == "comparison":
        opener = f"I built {product_name} as a review-first option for this."
        notes.append("reframed the opener around direct comparison intent")
    elif intent == "request":
        opener = f"I built {product_name} for this workflow."
        notes.append("reframed the opener around the explicit ask")
    elif intent == "pain":
        opener = f"I built {product_name} to make this less manual."
        notes.append("reframed the opener around the pain point")
    else:
        opener = sentences.pop(0) if sentences else reply_text.strip()
        notes.append("kept the original opener")

    if value_prop and value_prop.lower() not in f"{opener} {' '.join(sentences)}".lower():
        body = f"The useful part is {value_prop}."
        notes.append("re-centered the core value prop before queuing")
    else:
        body = " ".join(sentences).strip()

    rebuilt = " ".join(part for part in [opener, body, cta] if part).strip()
    return _truncate_reply(rebuilt), notes


async def _search_keyword_batch(page, keyword: str, strategy: dict, config: dict, max_results: int) -> list[dict]:
    filters = strategy.get("filters", {})
    if filters:
        return await search_posts_advanced(page, keyword, config, max_results=max_results, filters=filters)
    return await search_posts(page, keyword, config, max_results=max_results)


async def _run_queue_mode(config, account, run_id: str, browser, page, stats: dict):
    target_active_actions = TARGET_ACTIVE_QUEUE_SIZE
    candidate_batch_size = CANDIDATE_BATCH_SIZE
    search_results_per_keyword = SEARCH_RESULTS_PER_KEYWORD
    max_cycles = MAX_SEARCH_CYCLES_PER_STRATEGY

    log.subheader("Queue Strategy")
    log.stat("Target active queue", target_active_actions)
    log.stat("Lead batch size", candidate_batch_size)

    for raw_strategy in config.get("strategies", []):
        strategy = {**raw_strategy, "product": config.get("product", {})}
        current_queue = _active_queue_count(account["username"])
        if current_queue >= target_active_actions:
            log.success(f"Queue target already satisfied for @{account['username']} ({current_queue} active)")
            break

        strategy_name = strategy["name"]
        keywords = strategy.get("keywords", [])
        reply_template = strategy.get("reply_template", "")
        max_replies_per_keyword = max(1, int(strategy.get("max_replies_per_keyword", 5)))

        log.subheader(f"Strategy: {strategy_name}")
        log.stat("Current active queue", current_queue)
        log.stat("Keyword pool", len(keywords))

        if not keywords:
            log.warning("No keywords configured for strategy")
            continue

        seen_tweet_ids: set[str] = set()
        keyword_cursor = 0
        stagnant_cycles = 0

        for cycle in range(1, max_cycles + 1):
            current_queue = _active_queue_count(account["username"])
            if current_queue >= target_active_actions:
                log.success(f"Queue target reached ({current_queue} active)")
                break

            log.subheader(f"Cycle {cycle}: Find {candidate_batch_size} leads -> Filter -> Redraft -> Queue")
            cycle_candidates: list[dict] = []
            keywords_used: list[str] = []

            while len(cycle_candidates) < candidate_batch_size and len(keywords_used) < len(keywords):
                keyword = keywords[keyword_cursor % len(keywords)]
                keyword_cursor += 1
                keywords_used.append(keyword)

                log.step("🔍", f"Searching: {keyword}")
                posts = await _search_keyword_batch(
                    page,
                    keyword,
                    strategy,
                    config,
                    max_results=search_results_per_keyword,
                )
                stats["posts_found"] += len(posts)
                log.post_table(posts)

                for post in posts:
                    tweet_id = post.get("tweet_id", "")
                    if not tweet_id or tweet_id in seen_tweet_ids:
                        continue
                    seen_tweet_ids.add(tweet_id)
                    cycle_candidates.append(post)
                    if len(cycle_candidates) >= candidate_batch_size:
                        break

                if len(cycle_candidates) < candidate_batch_size:
                    await random_delay(1, 3)

            if not cycle_candidates:
                stagnant_cycles += 1
                log.warning("No new leads found this cycle")
                if stagnant_cycles >= 2:
                    log.warning("Stopping after repeated empty search cycles")
                    break
                continue

            stats["posts_considered"] += len(cycle_candidates)
            log.step("🧠", f"Filtering {len(cycle_candidates)} leads with local judgment...")

            shortlisted: list[dict] = []
            rejected = 0
            for post in cycle_candidates:
                relevant, score, reason = _local_relevance_assessment(post, strategy)
                if not relevant:
                    rejected += 1
                    continue
                shortlisted.append({**post, "relevance_score": score, "relevance_reason": reason})

            stats["posts_rejected"] += rejected
            stats["relevant_posts"] += len(shortlisted)

            if not shortlisted:
                stagnant_cycles += 1
                log.warning("All leads filtered out this cycle; searching again...")
                if stagnant_cycles >= 2:
                    log.warning("Stopping after repeated low-fit cycles")
                    break
                continue

            stagnant_cycles = 0
            shortlisted.sort(key=_candidate_sort_key, reverse=True)
            keyword_counts: dict[str, int] = {}

            for post in shortlisted:
                current_queue = _active_queue_count(account["username"])
                if current_queue >= target_active_actions:
                    break

                username = post.get("username", "")
                keyword = post.get("keyword", "")
                if keyword_counts.get(keyword, 0) >= max_replies_per_keyword:
                    continue

                if has_active_tweet_action(post.get("tweet_id", "")) or has_active_user_action(username):
                    stats["skipped_duplicates"] += 1
                    log.action("reply", f"@{username}", "skipped")
                    continue

                base_reply = _generate_reply(reply_template, post, strategy)
                reply_text, revision_notes = _reconsider_reply(base_reply, post, strategy)
                if not reply_text:
                    log.warning(f"No reply generated for @{username}")
                    continue

                staged = stage_action(
                    run_id,
                    _build_staged_reply_payload(
                        account,
                        strategy,
                        post,
                        reply_text,
                        relevance_reason=post.get("relevance_reason"),
                        relevance_score=post.get("relevance_score"),
                        revision_notes=revision_notes,
                    ),
                )
                stats["staged"] += 1
                keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
                log.success(
                    f"Queued review draft for @{username} -> "
                    f"{os.path.relpath(staged['_path'], BASE_DIR)}"
                )

            current_queue = _active_queue_count(account["username"])
            if current_queue >= target_active_actions:
                log.success(f"Queue target reached ({current_queue} active)")
                break

        final_queue = _active_queue_count(account["username"])
        if final_queue >= target_active_actions:
            break

    return stats


async def _run_direct_mode(config, account, run_id: str, browser, page, stats: dict, dry_run: bool, live_post: bool):
    for raw_strategy in config.get("strategies", []):
        strategy = {**raw_strategy, "product": config.get("product", {})}
        log.subheader(f"Strategy: {strategy['name']}")

        keywords = strategy.get("keywords", [])
        reply_template = strategy.get("reply_template", "")
        filters = strategy.get("filters", {})
        max_replies = strategy.get("max_replies_per_keyword", 5)

        for keyword in keywords:
            log.step("🔍", f"Searching: {keyword}")

            if filters:
                posts = await search_posts_advanced(
                    page,
                    keyword,
                    config,
                    max_results=max_replies * 2,
                    filters=filters,
                )
            else:
                posts = await search_posts(
                    page,
                    keyword,
                    config,
                    max_results=max_replies * 2,
                )

            stats["posts_found"] += len(posts)
            log.post_table(posts)

            if dry_run:
                log.info("DRY RUN - skipping staging and replies")
                continue

            replies_for_keyword = 0
            for post in posts:
                if replies_for_keyword >= max_replies:
                    break

                if not post.get("keyword_confirmed", False):
                    log.step("⏭️", f"Skipping - keyword not in text: @{post['username']}")
                    continue

                if has_active_tweet_action(post.get("tweet_id", "")) or has_active_user_action(post.get("username", "")):
                    stats["skipped_duplicates"] += 1
                    log.action("reply", f"@{post['username']}", "skipped")
                    continue

                reply_text = _generate_reply(reply_template, post, strategy)
                reply_text, _ = _reconsider_reply(reply_text, post, strategy)
                if not reply_text:
                    log.warning(f"No reply generated for @{post['username']}")
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

                if await check_rate_limit(page):
                    log.warning("Rate limited - stopping replies for this keyword")
                    break

                log.action("reply", f"@{post['username']}")
                success, page = await reply_to_tweet(browser, page, post["url"], reply_text, config)

                if success:
                    stats["replies_sent"] += 1
                    replies_for_keyword += 1
                    log.action("reply", f"@{post['username']}", "success")
                    _log_action(account, post, reply_text, "reply", True)
                else:
                    stats["replies_failed"] += 1
                    log.action("reply", f"@{post['username']}", "failed")
                    _log_action(account, post, reply_text, "reply", False)

                delay = await random_delay(
                    config["delays"]["between_actions_min_seconds"],
                    config["delays"]["between_actions_max_seconds"],
                )
                log.wait(delay, "between replies")

            await random_delay(5, 15)

    return stats


async def run_outreach(config, account, run_id: str, headless=False, dry_run=False, live_post=False):
    """Run outreach for a single account."""
    log.header(f"X OUTREACH - @{account['username']}")

    log.subheader("Authentication")
    browser, page = await login(config, account, headless=headless)

    if not browser or not page:
        log.error("Failed to login")
        return {"replies_sent": 0, "replies_failed": 0}

    stats = {
        "replies_sent": 0,
        "replies_failed": 0,
        "posts_found": 0,
        "posts_considered": 0,
        "posts_rejected": 0,
        "relevant_posts": 0,
        "staged": 0,
        "skipped_duplicates": 0,
    }

    try:
        if dry_run or live_post:
            await _run_direct_mode(config, account, run_id, browser, page, stats, dry_run=dry_run, live_post=live_post)
        else:
            await _run_queue_mode(config, account, run_id, browser, page, stats)
    except Exception as e:
        log.error(f"Outreach error: {e}")
        import traceback

        traceback.print_exc()
    finally:
        try:
            await browser.stop()
        except Exception:
            pass

    if not dry_run and not live_post:
        log.subheader("Staging Summary")
        log.stat("Run ID", run_id)
        log.stat("Replies staged", stats["staged"], log.GREEN)
        log.stat("Filtered out", stats["posts_rejected"], log.YELLOW)
        log.stat("Duplicates skipped", stats["skipped_duplicates"], log.YELLOW)
        log.stat("Active queue", _active_queue_count(account["username"]), log.CYAN)

    log.final_summary(stats["replies_sent"], stats["replies_failed"])
    return stats


def _generate_reply(template, post, strategy):
    """Generate a reply from template and post context."""
    if not template:
        return None

    reply = template
    product = strategy.get("product", {}) or {}

    reply = reply.replace("{username}", post.get("username", ""))
    reply = reply.replace("{keyword}", _clean_keyword(post.get("keyword", "")))
    reply = reply.replace("{product_name}", product.get("name", "your product"))
    reply = reply.replace("{product_url}", product.get("url", ""))
    reply = reply.replace("{value_prop}", product.get("value_prop", product.get("summary", "")))

    return _truncate_reply(reply)


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
    parser.add_argument("--schedule-approved", action="store_true", help="Schedule approved staged X actions")
    parser.add_argument("--dispatch-approved", action="store_true", help="Dispatch approved staged X actions")
    parser.add_argument("--account", type=str, help="Run specific account only")
    args = parser.parse_args()

    log.header("X OUTREACH BOT")
    log.info(f"Mode: {'headless' if args.headless else 'visible'}")
    log.info(f"Dry run: {args.dry_run}")
    log.info(f"Live post: {args.live_post}")

    config = load_config()
    accounts = config.get("accounts", [])

    if args.account:
        accounts = [a for a in accounts if a["username"] == args.account]
        if not accounts:
            log.error(f"Account '{args.account}' not found in config")
            sys.exit(1)

    if args.dispatch_approved:
        await dispatch_approved_actions(only_account=args.account, headless=args.headless)
        return

    if args.schedule_approved:
        schedule_approved_actions(config, only_account=args.account)
        return

    total_stats = {"replies_sent": 0, "replies_failed": 0}

    for account in accounts:
        run_id = _new_run_id(account["username"])
        stats = await run_outreach(
            config,
            account,
            run_id=run_id,
            headless=args.headless,
            dry_run=args.dry_run,
            live_post=args.live_post,
        )
        total_stats["replies_sent"] += stats["replies_sent"]
        total_stats["replies_failed"] += stats["replies_failed"]

        if len(accounts) > 1:
            await random_delay(30, 60)

    log.header("FINAL RESULTS")
    log.final_summary(total_stats["replies_sent"], total_stats["replies_failed"])


if __name__ == "__main__":
    asyncio.run(main())
