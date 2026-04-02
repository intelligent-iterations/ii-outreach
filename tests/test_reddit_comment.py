import unittest
from unittest.mock import AsyncMock, patch

from src.reddit.comment import COMMENT_FAILED, _reply_to_comment_permalink


class RedditCommentReplyTests(unittest.IsolatedAsyncioTestCase):
    async def test_reply_to_comment_permalink_fails_cleanly_when_target_comment_missing(self):
        browser = object()
        page = AsyncMock()
        page.get = AsyncMock()
        config = {"delays": {"page_load_wait_seconds": 0}}
        new_page = object()

        with (
            patch("src.reddit.comment._close_chat_overlay", AsyncMock()),
            patch("src.reddit.comment._check_if_locked", AsyncMock(return_value=False)),
            patch(
                "src.reddit.comment.verify_target_comment",
                AsyncMock(return_value={"verified": False, "reason": "Could not find target comment element"}),
            ),
            patch("src.reddit.comment.take_error_screenshot", AsyncMock()) as screenshot_mock,
            patch("src.reddit.comment._nuclear_tab_reset", AsyncMock(return_value=new_page)),
        ):
            returned_page, result, posted_url = await _reply_to_comment_permalink(
                browser,
                page,
                "/r/SaaS/comments/example/post/examplecomment",
                "Helpful reply",
                config,
                verify_keyword="gummysearch alternative",
                verify_username="gardenia856",
            )

        self.assertIs(returned_page, new_page)
        self.assertEqual(result, COMMENT_FAILED)
        self.assertIsNone(posted_url)
        screenshot_mock.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
