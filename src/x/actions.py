from __future__ import annotations

import argparse
import json
import os

from src.x.runtime.review_queue import ACTIONS_DIR, RUNS_DIR, list_actions


DEFAULT_STATUSES = [
    "pending_review",
    "approved",
    "scheduled",
    "dispatching",
    "dispatched",
    "failed",
    "rejected",
]


def _normalize_statuses(raw_statuses: list[str] | None) -> set[str] | None:
    if not raw_statuses:
        return None
    statuses: set[str] = set()
    for raw in raw_statuses:
        for status in raw.split(","):
            status = status.strip()
            if status:
                statuses.add(status)
    return statuses or None


def _filter_actions(
    actions: list[dict],
    account: str | None = None,
    run_id: str | None = None,
    action_type: str | None = None,
) -> list[dict]:
    filtered = actions
    if account:
        filtered = [action for action in filtered if action.get("account", "").lower() == account.lower()]
    if run_id:
        filtered = [action for action in filtered if action.get("run_id") == run_id]
    if action_type:
        filtered = [action for action in filtered if action.get("action_type", "") == action_type]
    return filtered


def format_summary() -> str:
    actions = list_actions()
    counts = {status: 0 for status in DEFAULT_STATUSES}
    extra_counts: dict[str, int] = {}
    runs = set()
    accounts = set()

    for action in actions:
        status = action.get("status", "unknown")
        if status in counts:
            counts[status] += 1
        else:
            extra_counts[status] = extra_counts.get(status, 0) + 1
        if action.get("run_id"):
            runs.add(action["run_id"])
        if action.get("account"):
            accounts.add(action["account"])

    lines = [
        f"Action root: {ACTIONS_DIR}",
        f"Total actions: {len(actions)}",
        f"Runs: {len(runs)}",
        f"Accounts: {len(accounts)}",
        "",
        "By status:",
    ]
    for status in DEFAULT_STATUSES:
        lines.append(f"  {status:14} {counts[status]}")
    for status in sorted(extra_counts):
        lines.append(f"  {status:14} {extra_counts[status]}")
    return "\n".join(lines)


def format_actions(
    statuses: set[str] | None = None,
    account: str | None = None,
    run_id: str | None = None,
    action_type: str | None = None,
    limit: int = 20,
) -> str:
    actions = list_actions(statuses)
    actions = _filter_actions(actions, account=account, run_id=run_id, action_type=action_type)
    actions = actions[:limit]

    if not actions:
        return "No actions found."

    lines = [f"Showing {len(actions)} action(s):", ""]
    for action in actions:
        target = action.get("username") or action.get("tweet_id") or "unknown-target"
        tweet_url = action.get("tweet_url", "")
        artifact_path = action.get("_path", "")
        if artifact_path:
            artifact_path = os.path.relpath(os.path.realpath(artifact_path), os.path.realpath(ACTIONS_DIR))

        lines.extend(
            [
                f"{action.get('status', 'unknown'):14} {action.get('account', '-'):<16} {action.get('action_type', '-'):<8} {target}",
                f"  run: {action.get('run_id', '-')}",
                f"  path: {artifact_path or '-'}",
                f"  tweet: {tweet_url or '-'}",
                f"  scheduled: {action.get('scheduled_for', '-')}",
                f"  message: {(action.get('message', '') or '').replace(chr(10), ' ')[:160]}",
                "",
            ]
        )
    return "\n".join(lines).rstrip()


def format_run(run_id: str) -> str:
    manifest_path = os.path.join(RUNS_DIR, run_id, "manifest.json")
    if not os.path.exists(manifest_path):
        return f"Run manifest not found: {manifest_path}"

    with open(manifest_path, "r") as handle:
        payload = json.load(handle)
    lines = [
        f"Run: {payload.get('run_id', run_id)}",
        f"Manifest: {manifest_path}",
        f"Updated: {payload.get('updated_at', '-')}",
        "",
        "Counts:",
    ]
    counts = payload.get("counts_by_status", {})
    for status in sorted(counts):
        lines.append(f"  {status:14} {counts[status]}")

    lines.append("")
    lines.append("Actions:")
    for action in payload.get("actions", []):
        lines.append(
            f"  {action.get('status', 'unknown'):14} {action.get('account', '-'):<16} "
            f"{action.get('action_type', '-'):<8} {action.get('username', '-')}"
        )
        lines.append(f"    artifact: {action.get('artifact_path', '-')}")
        lines.append(f"    tweet: {action.get('tweet_url', '-')}")
        if action.get("scheduled_for"):
            lines.append(f"    scheduled: {action.get('scheduled_for')}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Inspect staged X outreach actions")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("summary", help="Show action counts by status")

    list_parser = subparsers.add_parser("list", help="List actions with optional filters")
    list_parser.add_argument("--status", action="append", help="Filter by status; repeat or pass comma-separated values")
    list_parser.add_argument("--account", help="Filter by account username")
    list_parser.add_argument("--run-id", help="Filter by run id")
    list_parser.add_argument("--action-type", help="Filter by action type")
    list_parser.add_argument("--limit", type=int, default=20, help="Maximum number of actions to show")

    run_parser = subparsers.add_parser("show-run", help="Show one run manifest")
    run_parser.add_argument("run_id", help="Run id to inspect")

    args = parser.parse_args()

    if args.command == "summary":
        print(format_summary())
        return

    if args.command == "list":
        print(
            format_actions(
                statuses=_normalize_statuses(args.status),
                account=args.account,
                run_id=args.run_id,
                action_type=args.action_type,
                limit=args.limit,
            )
        )
        return

    if args.command == "show-run":
        print(format_run(args.run_id))
        return


if __name__ == "__main__":
    main()
