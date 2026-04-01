import unittest
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

        with (
            patch("src.x.main.login", AsyncMock(return_value=(browser, page))),
            patch("src.x.main.search_posts", AsyncMock(return_value=posts)),
            patch("src.x.main.search_posts_advanced", AsyncMock(return_value=[])),
            patch("src.x.main.reply_to_tweet", AsyncMock()) as reply_to_tweet,
            patch("src.x.main.check_rate_limit", AsyncMock(return_value=False)),
            patch("src.x.main.random_delay", AsyncMock(return_value=0)),
            patch("src.x.main.has_active_tweet_action", return_value=False),
            patch("src.x.main.has_active_user_action", return_value=False),
            patch(
                "src.x.main.stage_action",
                return_value={"_path": "/tmp/project/x/output/actions/by_status/pending_review/example.json"},
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


if __name__ == "__main__":
    unittest.main()
