"""
Staged action queue for safe review of X outreach intents.

Canonical storage now lives under:

- output/actions/by_status/<status>/
- output/actions/by_run/<run_id>/manifest.json
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from typing import Iterable, Optional

from src.x.shared.utils import BASE_DIR

OUTPUT_DIR = os.path.join(BASE_DIR, "output")
ACTIONS_DIR = os.path.join(OUTPUT_DIR, "actions")
STATUS_DIR = os.path.join(ACTIONS_DIR, "by_status")
RUNS_DIR = os.path.join(ACTIONS_DIR, "by_run")

ACTIVE_STATUSES = {"pending_review", "approved", "scheduled", "dispatching"}
KNOWN_STATUSES = (
    "pending_review",
    "approved",
    "scheduled",
    "rejected",
    "dispatching",
    "dispatched",
    "failed",
)


def _ensure_dirs():
    os.makedirs(STATUS_DIR, exist_ok=True)
    os.makedirs(RUNS_DIR, exist_ok=True)
    for status in KNOWN_STATUSES:
        os.makedirs(_status_dir(status), exist_ok=True)


def _status_dir(status: str) -> str:
    return os.path.join(STATUS_DIR, status)


def _run_dir(run_id: str) -> str:
    _ensure_dirs()
    path = os.path.join(RUNS_DIR, run_id)
    os.makedirs(path, exist_ok=True)
    return path


def _iter_action_files() -> Iterable[str]:
    _ensure_dirs()
    if not os.path.isdir(STATUS_DIR):
        return
    for root, _, files in os.walk(STATUS_DIR):
        for filename in files:
            if filename.endswith(".json"):
                yield os.path.join(root, filename)


def _read(path: str) -> dict:
    with open(path, "r") as f:
        return json.load(f)


def _write(path: str, data: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _slugify(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return cleaned or fallback


def _timestamp_prefix(value: str | None) -> str:
    if not value:
        return datetime.now().strftime("%Y%m%dT%H%M%S")
    try:
        return datetime.fromisoformat(value).strftime("%Y%m%dT%H%M%S")
    except ValueError:
        return re.sub(r"[^0-9A-Za-z]+", "", value)[:15] or datetime.now().strftime("%Y%m%dT%H%M%S")


def _action_filename(action: dict) -> str:
    timestamp = _timestamp_prefix(action.get("created_at"))
    account = _slugify(action.get("account", ""), "unknown-account")
    action_type = _slugify(action.get("action_type", ""), "action")
    target = _slugify(
        action.get("username", "") or action.get("tweet_id", "") or action.get("run_id", ""),
        "unknown-target",
    )
    action_id = (action.get("id") or "unknown-id")[:8]
    return f"{timestamp}__{account}__{action_type}__{target}__{action_id}.json"


def _canonical_path(action: dict) -> str:
    status = action.get("status") or "pending_review"
    return os.path.join(_status_dir(status), _action_filename(action))


def _cleanup_empty_dirs(start_dir: str, stop_dir: str):
    current = os.path.abspath(start_dir)
    stop = os.path.abspath(stop_dir)
    while current.startswith(stop) and current != stop:
        try:
            os.rmdir(current)
        except OSError:
            return
        current = os.path.dirname(current)


def _refresh_run_manifest(run_id: str | None):
    if not run_id:
        return

    actions = [action for action in list_actions() if action.get("run_id") == run_id]
    manifest_path = os.path.join(_run_dir(run_id), "manifest.json")

    if not actions:
        if os.path.exists(manifest_path):
            os.remove(manifest_path)
        return

    counts_by_status: dict[str, int] = {}
    manifest_actions = []
    for action in actions:
        status = action.get("status", "unknown")
        counts_by_status[status] = counts_by_status.get(status, 0) + 1
        manifest_actions.append(
            {
                "id": action.get("id"),
                "status": status,
                "account": action.get("account"),
                "action_type": action.get("action_type"),
                "username": action.get("username"),
                "tweet_url": action.get("tweet_url"),
                "scheduled_for": action.get("scheduled_for"),
                "artifact_path": os.path.relpath(os.path.realpath(action["_path"]), os.path.realpath(OUTPUT_DIR)),
            }
        )

    _write(
        manifest_path,
        {
            "run_id": run_id,
            "updated_at": datetime.now().isoformat(),
            "counts_by_status": counts_by_status,
            "actions": manifest_actions,
        },
    )


def _persist_action(action: dict, previous_path: str | None = None, previous_run_id: str | None = None) -> dict:
    path = _canonical_path(action)
    serializable = {key: value for key, value in action.items() if not key.startswith("_")}
    _write(path, serializable)

    if previous_path:
        previous_path = os.path.abspath(previous_path)
        new_path = os.path.abspath(path)
        if previous_path != new_path and os.path.exists(previous_path):
            os.remove(previous_path)
            if previous_path.startswith(os.path.abspath(STATUS_DIR)):
                _cleanup_empty_dirs(os.path.dirname(previous_path), STATUS_DIR)

    action["_path"] = path
    _refresh_run_manifest(previous_run_id)
    _refresh_run_manifest(action.get("run_id"))
    return action


def list_actions(statuses: Optional[set[str]] = None) -> list[dict]:
    actions = []
    for path in _iter_action_files():
        try:
            data = _read(path)
        except Exception:
            continue
        data["_path"] = path
        if statuses and data.get("status") not in statuses:
            continue
        actions.append(data)
    actions.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return actions


def get_action(action_id: str) -> Optional[dict]:
    for action in list_actions():
        if action.get("id") == action_id:
            return action
    return None


def has_active_tweet_action(tweet_id: str) -> bool:
    if not tweet_id:
        return False
    for action in list_actions(ACTIVE_STATUSES):
        if action.get("tweet_id") == tweet_id:
            return True
    return False


def has_active_user_action(username: str) -> bool:
    username = (username or "").lower()
    for action in list_actions(ACTIVE_STATUSES):
        if action.get("username", "").lower() == username:
            return True
    return False


def stage_action(run_id: str, payload: dict) -> dict:
    action_id = payload.get("id") or str(uuid.uuid4())
    now = datetime.now().isoformat()
    action = {
        "id": action_id,
        "run_id": run_id,
        "status": "pending_review",
        "created_at": now,
        "updated_at": now,
        **payload,
    }
    return _persist_action(action)


def update_action_status(action_id: str, status: str, note: str | None = None) -> Optional[dict]:
    action = get_action(action_id)
    if not action:
        return None
    previous_path = action.get("_path")
    action["status"] = status
    action["updated_at"] = datetime.now().isoformat()
    if note:
        action["note"] = note
    return _persist_action(action, previous_path=previous_path)


def update_action(action_id: str, **fields) -> Optional[dict]:
    action = get_action(action_id)
    if not action:
        return None
    previous_path = action.get("_path")
    previous_run_id = action.get("run_id")
    action.update(fields)
    action["updated_at"] = datetime.now().isoformat()
    return _persist_action(action, previous_path=previous_path, previous_run_id=previous_run_id)


def mark_action_result(action_id: str, status: str, result: dict | None = None, error: str | None = None) -> Optional[dict]:
    action = get_action(action_id)
    if not action:
        return None
    previous_path = action.get("_path")
    action["status"] = status
    action["updated_at"] = datetime.now().isoformat()
    if result is not None:
        action["dispatch_result"] = result
    if error:
        action["dispatch_error"] = error
    return _persist_action(action, previous_path=previous_path)


def list_due_actions(now: datetime | None = None, statuses: Optional[set[str]] = None) -> list[dict]:
    now = now or datetime.now()
    due = []
    for action in list_actions(statuses or {"scheduled"}):
        scheduled_for = action.get("scheduled_for")
        if not scheduled_for:
            continue
        try:
            scheduled_dt = datetime.fromisoformat(scheduled_for)
        except ValueError:
            continue
        if scheduled_dt <= now:
            due.append(action)
    due.sort(key=lambda item: item.get("scheduled_for", ""))
    return due
