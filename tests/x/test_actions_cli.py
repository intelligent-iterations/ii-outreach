import importlib
import os
import shutil
import tempfile
import unittest


class ActionsCliTests(unittest.TestCase):
    def setUp(self):
        self._old_env = os.environ.get("OUTREACH_PROJECT_DIR")
        self._tmpdir = tempfile.mkdtemp(prefix="outreach-x-actions-cli-")
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
        import src.x.actions as actions

        importlib.reload(project_paths)
        importlib.reload(utils)
        queue = importlib.reload(review_queue)
        cli = importlib.reload(actions)
        return queue, cli

    def test_summary_and_show_run_include_status_and_run_details(self):
        queue, cli = self._reload_modules()

        staged = queue.stage_action(
            "run-cli-x-1",
            {
                "account": "maintainer",
                "action_type": "reply",
                "username": "target_user",
                "tweet_id": "123",
                "tweet_url": "https://x.com/target_user/status/123",
                "message": "Helpful reply",
            },
        )
        queue.update_action_status(staged["id"], "approved")

        summary = cli.format_summary()
        run_view = cli.format_run("run-cli-x-1")
        listing = cli.format_actions(statuses={"approved"}, limit=10)

        self.assertIn("approved", summary)
        self.assertIn("run-cli-x-1", run_view)
        self.assertIn("artifact:", run_view)
        self.assertIn("Showing 1 action(s):", listing)
        self.assertIn("target_user", listing)


if __name__ == "__main__":
    unittest.main()
