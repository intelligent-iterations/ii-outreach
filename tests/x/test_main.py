import importlib
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from src.x.main import run_outreach


class _FakeBrowser:
    def __init__(self):
        self.stop = AsyncMock()


class XMainTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_outreach_stages_actions_by_default(self):
        config = {
            "product": {"name": "Outreach", "url": "https://example.com", "value_prop": "less manual outreach"},
            "strategies": [
                {
                    "name": "competitor_alternative",
                    "keywords": ["outreach tool"],
                    "reply_template": "{product_name} helps with {keyword}",
                    "max_replies_per_keyword": 1,
                }
            ],
            "delays": {
                "page_load_wait_seconds": 0,
                "between_actions_min_seconds": 0,
                "between_actions_max_seconds": 0,
            },
        }
        account = {"username": "maintainer"}
        browser = _FakeBrowser()
        page = object()
        posts = [
            {
                "tweet_id": "123",
                "username": "target_user",
                "text": "Need an outreach tool",
                "url": "https://x.com/target_user/status/123",
                "keyword": "outreach tool",
                "keyword_confirmed": True,
                "likes": 5,
                "retweets": 1,
                "replies": 0,
            }
        ]
        staged_actions = []

        def stage_action_side_effect(_run_id, payload):
            staged_actions.append(
                {
                    "id": f"queued-{len(staged_actions) + 1}",
                    "status": "pending_review",
                    "account": payload["account"],
                    **payload,
                }
            )
            return {"_path": "/tmp/project/x/output/actions/by_status/pending_review/example.json"}

        def list_actions_side_effect(_statuses=None):
            return list(staged_actions)

        with (
            patch("src.x.main.login", AsyncMock(return_value=(browser, page))),
            patch("src.x.main.search_posts", AsyncMock(return_value=posts)),
            patch("src.x.main.search_posts_advanced", AsyncMock(return_value=[])),
            patch("src.x.main.reply_to_tweet", AsyncMock()) as reply_to_tweet,
            patch("src.x.main.check_rate_limit", AsyncMock(return_value=False)),
            patch("src.x.main.random_delay", AsyncMock(return_value=0)),
            patch("src.x.main.list_actions", side_effect=list_actions_side_effect),
            patch("src.x.main.has_active_tweet_action", return_value=False),
            patch("src.x.main.has_active_user_action", return_value=False),
            patch(
                "src.x.main.stage_action",
                side_effect=stage_action_side_effect,
            ) as stage_action,
        ):
            stats = await run_outreach(config, account, run_id="run-1", dry_run=False, live_post=False)

        stage_action.assert_called_once()
        reply_to_tweet.assert_not_called()
        browser.stop.assert_awaited_once()
        self.assertEqual(stats["staged"], 1)
        self.assertEqual(stats["replies_sent"], 0)
        self.assertEqual(stats["replies_failed"], 0)

    async def test_run_outreach_live_post_bypasses_staging(self):
        config = {
            "product": {"name": "Outreach", "url": "https://example.com", "value_prop": "less manual outreach"},
            "strategies": [
                {
                    "name": "competitor_alternative",
                    "keywords": ["outreach tool"],
                    "reply_template": "{product_name} helps with {keyword}",
                    "max_replies_per_keyword": 1,
                }
            ],
            "delays": {
                "page_load_wait_seconds": 0,
                "between_actions_min_seconds": 0,
                "between_actions_max_seconds": 0,
            },
        }
        account = {"username": "maintainer"}
        browser = _FakeBrowser()
        page = object()
        posts = [
            {
                "tweet_id": "123",
                "username": "target_user",
                "text": "Need an outreach tool",
                "url": "https://x.com/target_user/status/123",
                "keyword": "outreach tool",
                "keyword_confirmed": True,
            }
        ]

        with (
            patch("src.x.main.login", AsyncMock(return_value=(browser, page))),
            patch("src.x.main.search_posts", AsyncMock(return_value=posts)),
            patch("src.x.main.search_posts_advanced", AsyncMock(return_value=[])),
            patch("src.x.main.reply_to_tweet", AsyncMock(return_value=(True, page))) as reply_to_tweet,
            patch("src.x.main.check_rate_limit", AsyncMock(return_value=False)),
            patch("src.x.main.random_delay", AsyncMock(return_value=0)),
            patch("src.x.main.list_actions", return_value=[]),
            patch("src.x.main.has_active_tweet_action", return_value=False),
            patch("src.x.main.has_active_user_action", return_value=False),
            patch("src.x.main.stage_action") as stage_action,
        ):
            stats = await run_outreach(config, account, run_id="run-2", dry_run=False, live_post=True)

        reply_to_tweet.assert_awaited_once()
        stage_action.assert_not_called()
        browser.stop.assert_awaited_once()
        self.assertEqual(stats["staged"], 0)
        self.assertEqual(stats["replies_sent"], 1)
        self.assertEqual(stats["replies_failed"], 0)

    async def test_run_outreach_filters_builder_promo_and_keeps_real_request(self):
        config = {
            "product": {"name": "Outreach", "url": "https://example.com", "value_prop": "less manual outreach"},
            "strategies": [
                {
                    "name": "competitor_alternative",
                    "keywords": ["outreach tool"],
                    "reply_template": "{product_name} helps with {keyword}. Happy to share the repo if useful.",
                    "max_replies_per_keyword": 2,
                }
            ],
            "delays": {
                "page_load_wait_seconds": 0,
                "between_actions_min_seconds": 0,
                "between_actions_max_seconds": 0,
            },
        }
        account = {"username": "maintainer"}
        browser = _FakeBrowser()
        page = object()
        posts = [
            {
                "tweet_id": "promo-1",
                "username": "builder",
                "text": "I built an outreach tool and just launched it today https://example.com",
                "url": "https://x.com/builder/status/promo-1",
                "keyword": "outreach tool",
                "keyword_confirmed": True,
                "likes": 1,
                "retweets": 0,
                "replies": 0,
            },
            {
                "tweet_id": "good-1",
                "username": "target_user",
                "text": "Anyone know a good outreach tool? Manual prospecting is killing me.",
                "url": "https://x.com/target_user/status/good-1",
                "keyword": "outreach tool",
                "keyword_confirmed": True,
                "likes": 2,
                "retweets": 0,
                "replies": 1,
            },
        ]
        staged_actions = []

        def stage_action_side_effect(_run_id, payload):
            staged_actions.append(
                {
                    "id": f"queued-{len(staged_actions) + 1}",
                    "status": "pending_review",
                    "account": payload["account"],
                    **payload,
                }
            )
            return {"_path": "/tmp/project/x/output/actions/by_status/pending_review/example.json"}

        def list_actions_side_effect(_statuses=None):
            return list(staged_actions)

        with (
            patch("src.x.main.login", AsyncMock(return_value=(browser, page))),
            patch("src.x.main.search_posts", AsyncMock(return_value=posts)),
            patch("src.x.main.search_posts_advanced", AsyncMock(return_value=[])),
            patch("src.x.main.reply_to_tweet", AsyncMock()) as reply_to_tweet,
            patch("src.x.main.check_rate_limit", AsyncMock(return_value=False)),
            patch("src.x.main.random_delay", AsyncMock(return_value=0)),
            patch("src.x.main.list_actions", side_effect=list_actions_side_effect),
            patch("src.x.main.has_active_tweet_action", return_value=False),
            patch("src.x.main.has_active_user_action", return_value=False),
            patch("src.x.main.stage_action", side_effect=stage_action_side_effect) as stage_action,
        ):
            stats = await run_outreach(config, account, run_id="run-3", dry_run=False, live_post=False)

        stage_action.assert_called_once()
        reply_to_tweet.assert_not_called()
        browser.stop.assert_awaited_once()
        self.assertEqual(stats["staged"], 1)
        self.assertEqual(stats["posts_rejected"], 1)
        self.assertEqual(staged_actions[0]["username"], "target_user")
        self.assertIn("review_context", staged_actions[0])


class XSchedulingTests(unittest.TestCase):
    def setUp(self):
        self._old_env = os.environ.get("OUTREACH_PROJECT_DIR")
        self._tmpdir = tempfile.mkdtemp(prefix="outreach-x-scheduling-")
        os.environ["OUTREACH_PROJECT_DIR"] = self._tmpdir

    def tearDown(self):
        if self._old_env is None:
            os.environ.pop("OUTREACH_PROJECT_DIR", None)
        else:
            os.environ["OUTREACH_PROJECT_DIR"] = self._old_env
        shutil.rmtree(self._tmpdir)

    def _reload_modules(self):
        import src.x.shared.project_paths as project_paths
        import src.x.shared.utils as utils
        import src.x.runtime.review_queue as review_queue
        import src.x.dispatch_approved as dispatch_approved

        importlib.reload(project_paths)
        importlib.reload(utils)
        queue = importlib.reload(review_queue)
        dispatch = importlib.reload(dispatch_approved)
        return queue, dispatch

    def test_schedule_approved_actions_moves_items_into_scheduled_bucket(self):
        queue, dispatch = self._reload_modules()
        queue.stage_action(
            "run-x-schedule-1",
            {
                "account": "maintainer",
                "action_type": "reply",
                "username": "target_user",
                "tweet_id": "123",
                "tweet_url": "https://x.com/target_user/status/123",
                "message": "Helpful reply",
            },
        )
        staged = queue.list_actions({"pending_review"})[0]
        queue.update_action_status(staged["id"], "approved")

        result = dispatch.schedule_approved_actions(
            {
                "accounts": [{"username": "maintainer"}],
                "schedule": {"daily_reply_limit": 5, "start_in_days": 1},
            }
        )

        self.assertEqual(result["scheduled"], 1)
        scheduled = queue.list_actions({"scheduled"})
        self.assertEqual(len(scheduled), 1)
        self.assertIn("scheduled_for", scheduled[0])
        due_now = queue.list_due_actions()
        self.assertEqual(due_now, [])


class XDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._old_env = os.environ.get("OUTREACH_PROJECT_DIR")
        self._tmpdir = tempfile.mkdtemp(prefix="outreach-x-dispatch-")
        os.environ["OUTREACH_PROJECT_DIR"] = self._tmpdir
        x_dir = Path(self._tmpdir) / "x"
        x_dir.mkdir(parents=True, exist_ok=True)
        (x_dir / "config.json").write_text(
            json.dumps(
                {
                    "accounts": [{"username": "maintainer"}],
                    "schedule": {"daily_reply_limit": 20, "start_in_days": 1},
                    "delays": {"page_load_wait_seconds": 0},
                }
            )
        )

    async def asyncTearDown(self):
        if self._old_env is None:
            os.environ.pop("OUTREACH_PROJECT_DIR", None)
        else:
            os.environ["OUTREACH_PROJECT_DIR"] = self._old_env
        shutil.rmtree(self._tmpdir)

    def _reload_modules(self):
        import src.x.shared.project_paths as project_paths
        import src.x.shared.utils as utils
        import src.x.runtime.review_queue as review_queue
        import src.x.dispatch_approved as dispatch_approved

        importlib.reload(project_paths)
        importlib.reload(utils)
        queue = importlib.reload(review_queue)
        dispatch = importlib.reload(dispatch_approved)
        return queue, dispatch

    async def test_dispatch_approved_actions_passes_headless_to_login(self):
        queue, dispatch = self._reload_modules()
        staged = queue.stage_action(
            "run-x-dispatch-1",
            {
                "account": "maintainer",
                "action_type": "reply",
                "username": "target_user",
                "tweet_id": "123",
                "tweet_url": "https://x.com/target_user/status/123",
                "message": "Helpful reply",
            },
        )
        queue.update_action(staged["id"], status="scheduled", scheduled_for="2000-01-01T00:00:00")

        browser = _FakeBrowser()
        page = object()

        with (
            patch("src.x.dispatch_approved.login", AsyncMock(return_value=(browser, page))) as login_mock,
            patch("src.x.dispatch_approved.reply_to_tweet", AsyncMock(return_value=(True, page))) as reply_mock,
        ):
            result = await dispatch.dispatch_approved_actions(headless=True)

        login_mock.assert_awaited_once()
        self.assertEqual(login_mock.await_args.kwargs["headless"], True)
        reply_mock.assert_awaited_once()
        browser.stop.assert_awaited_once()
        self.assertEqual(result["dispatched"], 1)
        self.assertEqual(len(queue.list_actions({"dispatched"})), 1)


if __name__ == "__main__":
    unittest.main()
