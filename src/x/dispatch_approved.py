import argparse
import asyncio

from src.x.platform.auth import login
from src.x.platform.reply import reply_to_tweet
from src.x.runtime.review_queue import list_actions, mark_action_result
from src.x.shared.utils import load_config, log


async def dispatch_approved_actions(only_account: str | None = None) -> dict:
    config = load_config()
    approved = list_actions({"approved"})

    if only_account:
        approved = [item for item in approved if item.get("account", "").lower() == only_account.lower()]

    if not approved:
        print("No approved X actions to dispatch.")
        return {"dispatched": 0, "failed": 0}

    accounts_by_name = {acc["username"]: acc for acc in config.get("accounts", [])}
    grouped: dict[str, list[dict]] = {}
    for action in approved:
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

        browser, page = await login(config, account, headless=False)
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

    print(f"Dispatch complete. dispatched={dispatched} failed={failed}")
    return {"dispatched": dispatched, "failed": failed}


def main():
    parser = argparse.ArgumentParser(description="Dispatch approved staged X actions")
    parser.add_argument("--account", type=str, help="Only dispatch actions for a specific account")
    args = parser.parse_args()

    asyncio.run(dispatch_approved_actions(only_account=args.account))


if __name__ == "__main__":
    main()
