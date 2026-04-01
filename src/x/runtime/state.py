"""
State management for X outreach bot.

Tracks:
- Tweets we've replied to (avoid duplicates)
- All actions with permalinks (for performance tracking)
"""

import fcntl
import json
import os
from datetime import date, datetime
from enum import Enum
from typing import Optional
from src.x.shared.project_paths import PROJECT_DIR as BASE_DIR

TRACKING_DIR = os.path.join(BASE_DIR, "tracking")
STATE_FILE = os.path.join(TRACKING_DIR, "state.json")
LOCK_FILE = os.path.join(TRACKING_DIR, "state.lock")


class ActionType(Enum):
    REPLY = "reply"
    QUOTE = "quote"
    LIKE = "like"


class ActionResult(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


def _ensure_data_dir():
    os.makedirs(TRACKING_DIR, exist_ok=True)


def _get_empty_state() -> dict:
    return {
        "meta": {
            "first_run_date": date.today().isoformat(),
            "version": 1,
        },
        "replied_tweets": {},  # tweet_id -> action record
        "actions": [],         # All actions for performance tracking
    }


def _read_state() -> dict:
    _ensure_data_dir()

    if not os.path.exists(STATE_FILE):
        return _get_empty_state()

    with open(STATE_FILE, "r") as f:
        fcntl.flock(f, fcntl.LOCK_SH)
        try:
            data = json.load(f)
            if "meta" not in data:
                data["meta"] = {"first_run_date": date.today().isoformat(), "version": 1}
            if "replied_tweets" not in data:
                data["replied_tweets"] = {}
            if "actions" not in data:
                data["actions"] = []
            return data
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _write_state(data: dict):
    _ensure_data_dir()

    with open(STATE_FILE, "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _with_lock(func):
    def wrapper(*args, **kwargs):
        _ensure_data_dir()
        # Create lock file if doesn't exist
        if not os.path.exists(LOCK_FILE):
            open(LOCK_FILE, 'w').close()

        with open(LOCK_FILE, "r+") as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                return func(*args, **kwargs)
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)
    return wrapper


# =============================================================================
# TWEET TRACKING
# =============================================================================

def has_replied_to_tweet(tweet_id: str) -> bool:
    """Check if we've already replied to this tweet."""
    state = _read_state()
    return tweet_id in state["replied_tweets"]


def has_engaged_user(username: str) -> bool:
    """Check if we've engaged with this user before."""
    state = _read_state()
    username_lower = username.lower()

    for action in state["actions"]:
        if action.get("target_user", "").lower() == username_lower:
            if action.get("result") == ActionResult.SUCCESS.value:
                return True
    return False


@_with_lock
def record_reply(
    tweet_id: str,
    tweet_url: str,
    target_user: str,
    reply_text: str,
    result: ActionResult,
    reply_url: Optional[str] = None,
    error: Optional[str] = None,
):
    """
    Record a reply action.

    Args:
        tweet_id: ID of the tweet we replied to
        tweet_url: URL of the original tweet
        target_user: Username of the tweet author
        reply_text: Our reply text
        result: Success/failed/skipped
        reply_url: URL of our reply (if we can get it)
        error: Error message if failed
    """
    state = _read_state()

    action = {
        "type": ActionType.REPLY.value,
        "timestamp": datetime.now().isoformat(),
        "tweet_id": tweet_id,
        "tweet_url": tweet_url,
        "target_user": target_user,
        "reply_text": reply_text[:280],
        "reply_url": reply_url,
        "result": result.value,
        "error": error,
    }

    # Mark tweet as replied
    if result == ActionResult.SUCCESS:
        state["replied_tweets"][tweet_id] = {
            "replied_at": datetime.now().isoformat(),
            "target_user": target_user,
            "reply_url": reply_url,
        }

    # Add to actions log
    state["actions"].append(action)

    _write_state(state)

    return action


@_with_lock
def record_quote(
    tweet_id: str,
    tweet_url: str,
    target_user: str,
    quote_text: str,
    result: ActionResult,
    quote_url: Optional[str] = None,
    error: Optional[str] = None,
):
    """Record a quote tweet action."""
    state = _read_state()

    action = {
        "type": ActionType.QUOTE.value,
        "timestamp": datetime.now().isoformat(),
        "tweet_id": tweet_id,
        "tweet_url": tweet_url,
        "target_user": target_user,
        "quote_text": quote_text[:280],
        "quote_url": quote_url,
        "result": result.value,
        "error": error,
    }

    state["actions"].append(action)
    _write_state(state)

    return action


# =============================================================================
# STATISTICS
# =============================================================================

def get_todays_reply_count() -> int:
    """Get count of successful replies today."""
    state = _read_state()
    today = date.today().isoformat()

    count = 0
    for action in state["actions"]:
        if (action.get("type") == ActionType.REPLY.value and
            action.get("result") == ActionResult.SUCCESS.value and
            action.get("timestamp", "").startswith(today)):
            count += 1

    return count


def get_stats() -> dict:
    """Get statistics summary."""
    state = _read_state()
    today = date.today().isoformat()

    stats = {
        "total_tweets_replied": len(state["replied_tweets"]),
        "total_actions": len(state["actions"]),
        "today": {
            "replies_success": 0,
            "replies_failed": 0,
            "quotes_success": 0,
            "quotes_failed": 0,
        },
        "all_time": {
            "replies_success": 0,
            "replies_failed": 0,
            "quotes_success": 0,
            "quotes_failed": 0,
        },
    }

    for action in state["actions"]:
        is_today = action.get("timestamp", "").startswith(today)
        is_success = action.get("result") == ActionResult.SUCCESS.value
        action_type = action.get("type")

        if action_type == ActionType.REPLY.value:
            key = "replies_success" if is_success else "replies_failed"
        elif action_type == ActionType.QUOTE.value:
            key = "quotes_success" if is_success else "quotes_failed"
        else:
            continue

        stats["all_time"][key] += 1
        if is_today:
            stats["today"][key] += 1

    return stats


def get_recent_actions(limit: int = 20) -> list:
    """Get recent actions for review."""
    state = _read_state()
    actions = state["actions"]
    return actions[-limit:][::-1]  # Most recent first


def print_state_summary():
    """Print a summary of current state."""
    stats = get_stats()
    print("\n=== X OUTREACH STATE ===")
    print(f"Tweets replied to: {stats['total_tweets_replied']}")
    print(f"Total actions: {stats['total_actions']}")
    print(f"\nToday:")
    print(f"  Replies: {stats['today']['replies_success']} success, {stats['today']['replies_failed']} failed")
    print(f"  Quotes: {stats['today']['quotes_success']} success, {stats['today']['quotes_failed']} failed")
    print(f"\nAll time:")
    print(f"  Replies: {stats['all_time']['replies_success']} success, {stats['all_time']['replies_failed']} failed")
    print(f"  Quotes: {stats['all_time']['quotes_success']} success, {stats['all_time']['quotes_failed']} failed")


# =============================================================================
# EXPORT FOR PERFORMANCE TRACKING
# =============================================================================

def export_actions_csv(filepath: Optional[str] = None) -> str:
    """Export all actions to CSV for performance analysis."""
    import csv

    if filepath is None:
        filepath = os.path.join(DATA_DIR, "actions_export.csv")

    state = _read_state()

    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "timestamp", "type", "target_user", "tweet_url",
            "reply_text", "reply_url", "result", "error"
        ])

        for action in state["actions"]:
            writer.writerow([
                action.get("timestamp", ""),
                action.get("type", ""),
                action.get("target_user", ""),
                action.get("tweet_url", ""),
                action.get("reply_text", action.get("quote_text", "")),
                action.get("reply_url", action.get("quote_url", "")),
                action.get("result", ""),
                action.get("error", ""),
            ])

    return filepath
