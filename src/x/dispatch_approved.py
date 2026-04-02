import argparse
import asyncio
from datetime import date, datetime, time, timedelta

from src.x.platform.auth import login
from src.x.platform.reply import reply_to_tweet
from src.x.runtime.review_queue import list_actions, list_due_actions, mark_action_result, update_action
from src.x.shared.utils import load_config, log


def _schedule_slot_datetime(target_date: date, slot_index: int, daily_limit: int, action_id: str) -> datetime:
    start_hour, end_hour = 10, 18
    window_start = start_hour * 60
    window_end = end_hour * 60
    slot_count = max(daily_limit, 1)
    spacing = max(20, (window_end - window_start) // (slot_count + 1))
    minute_of_day = window_start + spacing * (slot_index + 1)
    jitter = sum(ord(ch) for ch in action_id) % 9
    minute_of_day = min(window_end - 5, minute_of_day + jitter)
    hour = minute_of_day // 60
    minute = minute_of_day % 60
    return datetime.combine(target_date, time(hour=hour, minute=minute))


def schedule_approved_actions(config: dict, only_account: str | None = None) -> dict:
    approved = list_actions({"approved"})

    if only_account:
        approved = [item for item in approved if item.get("account", "").lower() == only_account.lower()]

    if not approved:
        print("No approved X actions to schedule.")
        return {"scheduled": 0, "assignments": []}

    schedule_cfg = config.get("schedule", {})
    daily_limit = max(1, int(schedule_cfg.get("daily_reply_limit", 10)))
    start_date = date.today() + timedelta(days=max(1, int(schedule_cfg.get("start_in_days", 1))))

    scheduled_counts: dict[tuple[str, str], int] = {}
    exclude_ids = {action.get("id") for action in approved if action.get("id")}
    for existing in list_actions({"scheduled", "dispatching"}):
        if existing.get("id") in exclude_ids:
            continue
        scheduled_for = existing.get("scheduled_for")
        if not scheduled_for:
            continue
        try:
            target_date = datetime.fromisoformat(scheduled_for).date()
        except ValueError:
            continue
        key = (existing.get("account", ""), target_date.isoformat())
        scheduled_counts[key] = scheduled_counts.get(key, 0) + 1

    assignments = []
    grouped: dict[str, list[dict]] = {}
    for action in approved:
        grouped.setdefault(action.get("account", ""), []).append(action)

    for account_name, actions in grouped.items():
        actions.sort(key=lambda item: item.get("created_at", ""))
        target_date = start_date
        for action in actions:
            while True:
                key = (account_name, target_date.isoformat())
                already_scheduled = scheduled_counts.get(key, 0)
                if already_scheduled < daily_limit:
                    scheduled_for = _schedule_slot_datetime(target_date, already_scheduled, daily_limit, action.get("id", ""))
                    update_action(
                        action["id"],
                        status="scheduled",
                        scheduled_for=scheduled_for.isoformat(),
                        schedule_note="auto-scheduled",
                        dispatch_error=None,
                    )
                    scheduled_counts[key] = already_scheduled + 1
                    assignments.append(
                        {
                            "id": action["id"],
                            "account": account_name,
                            "action_type": action.get("action_type", "reply"),
                            "scheduled_for": scheduled_for.isoformat(),
                        }
                    )
                    break
                target_date += timedelta(days=1)

    print(f"Scheduled {len(assignments)} approved X actions.")
    return {"scheduled": len(assignments), "assignments": assignments}


async def dispatch_approved_actions(only_account: str | None = None, headless: bool = False) -> dict:
    config = load_config()
    schedule_result = schedule_approved_actions(config, only_account=only_account)
    scheduled = list_due_actions()

    if only_account:
        scheduled = [item for item in scheduled if item.get("account", "").lower() == only_account.lower()]

    if not scheduled:
        print(f"No due scheduled X actions to dispatch. scheduled={schedule_result['scheduled']}")
        return {"scheduled": schedule_result["scheduled"], "dispatched": 0, "failed": 0}

    accounts_by_name = {acc["username"]: acc for acc in config.get("accounts", [])}
    grouped: dict[str, list[dict]] = {}
    for action in scheduled:
        grouped.setdefault(action["account"], []).append(action)

    dispatched = 0
    failed = 0

    for account_name, actions in grouped.items():
        account = accounts_by_name.get(account_name)
        if not account:
            for action in actions:
                mark_action_result(action["id"], "failed", error=f"Missing account config for {account_name}")
                failed += 1
            continue

        browser, page = await login(config, account, headless=headless)
        try:
            for action in actions:
                mark_action_result(action["id"], "dispatching")
                success, page = await reply_to_tweet(
                    browser,
                    page,
                    action["tweet_url"],
                    action["message"],
                    config,
                )
                if success:
                    mark_action_result(action["id"], "dispatched", result={"tweet_url": action["tweet_url"]})
                    dispatched += 1
                else:
                    mark_action_result(action["id"], "failed", error="Reply post failed")
                    failed += 1
        finally:
            try:
                await browser.stop()
            except Exception:
                pass

    print(
        f"Dispatch complete. scheduled={schedule_result['scheduled']} "
        f"dispatched={dispatched} failed={failed}"
    )
    return {"scheduled": schedule_result["scheduled"], "dispatched": dispatched, "failed": failed}


def main():
    parser = argparse.ArgumentParser(description="Dispatch approved staged X actions")
    parser.add_argument("--schedule-approved", action="store_true", help="Schedule approved staged X actions")
    parser.add_argument("--account", type=str, help="Only dispatch actions for a specific account")
    parser.add_argument("--headless", action="store_true", help="Run browser automation headlessly")
    args = parser.parse_args()

    if args.schedule_approved:
        config = load_config()
        schedule_approved_actions(config, only_account=args.account)
        return

    asyncio.run(dispatch_approved_actions(only_account=args.account, headless=args.headless))


if __name__ == "__main__":
    main()
