import importlib
import os
import shutil
import tempfile
import unittest
from pathlib import Path


class ActionsCliTests(unittest.TestCase):
    def setUp(self):
        self._old_env = os.environ.get("OUTREACH_PROJECT_DIR")
        self._tmpdir = tempfile.mkdtemp(prefix="outreach-actions-cli-")
        os.environ["OUTREACH_PROJECT_DIR"] = self._tmpdir

    def tearDown(self):
        if self._old_env is None:
            os.environ.pop("OUTREACH_PROJECT_DIR", None)
        else:
            os.environ["OUTREACH_PROJECT_DIR"] = self._old_env
        shutil.rmtree(self._tmpdir)

    def _reload_modules(self):
        import src.reddit.shared.project_paths as project_paths
        import src.reddit.shared.utils as utils
        import src.reddit.runtime.review_queue as review_queue
        import src.reddit.actions as actions

        importlib.reload(project_paths)
        importlib.reload(utils)
        queue = importlib.reload(review_queue)
        cli = importlib.reload(actions)
        return queue, cli

    def test_summary_and_show_run_include_status_and_run_details(self):
        queue, cli = self._reload_modules()

        staged = queue.stage_action(
            "run-cli-1",
            {
                "account": "maintainer",
                "action_type": "comment",
                "username": "target_user",
                "message": "Helpful comment",
                "permalink": "https://reddit.com/example",
            },
        )
        queue.update_action_status(staged["id"], "approved")

        summary = cli.format_summary()
        run_view = cli.format_run("run-cli-1")
        listing = cli.format_actions(statuses={"approved"}, limit=10)

        self.assertIn("approved", summary)
        self.assertIn("run-cli-1", run_view)
        self.assertIn("artifact:", run_view)
        self.assertIn("Showing 1 action(s):", listing)
        self.assertIn("target_user", listing)


if __name__ == "__main__":
    unittest.main()
