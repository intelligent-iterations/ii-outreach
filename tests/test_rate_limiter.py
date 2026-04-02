import unittest
from datetime import date
from unittest.mock import AsyncMock, patch

from src.reddit.runtime.rate_limiter import RateLimiter


class RateLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_wait_between_actions_can_disable_long_pause_via_config(self):
        config = {
            "delays": {
                "between_actions_min_seconds": 3,
                "between_actions_max_seconds": 6,
                "long_pause_min_seconds": 0,
                "long_pause_max_seconds": 0,
                "long_pause_every_min_actions": 0,
                "long_pause_every_max_actions": 0,
            },
            "ramp_schedule": {
                "days_1_to_3": {"max_comments": 10, "max_dms": 0},
                "days_4_to_7": {"max_comments": 10, "max_dms": 0},
                "days_8_plus": {"max_comments": 10, "max_dms": 0},
            },
        }
        account = {"username": "maintainer", "can_comment": True, "can_dm": False}

        with (
            patch("src.reddit.runtime.rate_limiter.get_first_run_date", return_value=date.today()),
            patch("src.reddit.runtime.rate_limiter.get_todays_action_count", return_value=0),
            patch("src.reddit.runtime.rate_limiter.random.uniform", return_value=4.0),
            patch("src.reddit.runtime.rate_limiter.asyncio.sleep", new=AsyncMock()) as sleep_mock,
        ):
            limiter = RateLimiter(config, account)
            waited = await limiter.wait_between_actions()

        self.assertEqual(waited, 4.0)
        sleep_mock.assert_awaited_once_with(4.0)

    async def test_wait_between_actions_uses_configured_long_pause_window(self):
        config = {
            "delays": {
                "between_actions_min_seconds": 3,
                "between_actions_max_seconds": 6,
                "long_pause_min_seconds": 11,
                "long_pause_max_seconds": 13,
                "long_pause_every_min_actions": 1,
                "long_pause_every_max_actions": 1,
            },
            "ramp_schedule": {
                "days_1_to_3": {"max_comments": 10, "max_dms": 0},
                "days_4_to_7": {"max_comments": 10, "max_dms": 0},
                "days_8_plus": {"max_comments": 10, "max_dms": 0},
            },
        }
        account = {"username": "maintainer", "can_comment": True, "can_dm": False}

        with (
            patch("src.reddit.runtime.rate_limiter.get_first_run_date", return_value=date.today()),
            patch("src.reddit.runtime.rate_limiter.get_todays_action_count", return_value=0),
            patch("src.reddit.runtime.rate_limiter.random.randint", return_value=1),
            patch("src.reddit.runtime.rate_limiter.random.uniform", return_value=12.0),
            patch("src.reddit.runtime.rate_limiter.asyncio.sleep", new=AsyncMock()) as sleep_mock,
        ):
            limiter = RateLimiter(config, account)
            waited = await limiter.wait_between_actions()

        self.assertEqual(waited, 12.0)
        sleep_mock.assert_awaited_once_with(12.0)


if __name__ == "__main__":
    unittest.main()
