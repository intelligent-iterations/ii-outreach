"""
Staged action queue for safe review of X outreach intents.

Actions are written under output/intended_actions/<run_id>/ as JSON artifacts.
They can later be approved/rejected and dispatched by a helper CLI.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Iterable, Optional

from src.shared.utils import BASE_DIR

OUTPUT_DIR = os.path.join(BASE_DIR, "output")
INTENDED_ACTIONS_DIR = os.path.join(OUTPUT_DIR, "intended_actions")

ACTIVE_STATUSES = {"pending_review", "approved", "dispatching"}


def _ensure_dirs():
    os.makedirs(INTENDED_ACTIONS_DIR, exist_ok=True)


def _run_dir(run_id: str) -> str:
    _ensure_dirs()
    path = os.path.join(INTENDED_ACTIONS_DIR, run_id)
    os.makedirs(path, exist_ok=True)
    return path


def _iter_action_files() -> Iterable[str]:
    _ensure_dirs()
    for root, _, files in os.walk(INTENDED_ACTIONS_DIR):
        for filename in files:
            if filename.endswith(".json"):
                yield os.path.join(root, filename)


def _read(path: str) -> dict:
    with open(path, "r") as f:
        return json.load(f)


def _write(path: str, data: dict):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


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
    path = os.path.join(_run_dir(run_id), f"{action_id}.json")
    _write(path, action)
    action["_path"] = path
    return action


def update_action_status(action_id: str, status: str, note: str | None = None) -> Optional[dict]:
    action = get_action(action_id)
    if not action:
        return None
    action["status"] = status
    action["updated_at"] = datetime.now().isoformat()
    if note:
        action["note"] = note
    path = action.pop("_path")
    _write(path, action)
    action["_path"] = path
    return action


def mark_action_result(action_id: str, status: str, result: dict | None = None, error: str | None = None) -> Optional[dict]:
    action = get_action(action_id)
    if not action:
        return None
    action["status"] = status
    action["updated_at"] = datetime.now().isoformat()
    if result is not None:
        action["dispatch_result"] = result
    if error:
        action["dispatch_error"] = error
    path = action.pop("_path")
    _write(path, action)
    action["_path"] = path
    return action
