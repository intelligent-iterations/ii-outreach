import importlib
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path


class ReviewQueueTests(unittest.TestCase):
    def setUp(self):
        self._old_env = os.environ.get("OUTREACH_PROJECT_DIR")
        self._tmpdir = tempfile.mkdtemp(prefix="outreach-review-queue-")
        os.environ["OUTREACH_PROJECT_DIR"] = self._tmpdir

    def tearDown(self):
        if self._old_env is None:
            os.environ.pop("OUTREACH_PROJECT_DIR", None)
        else:
            os.environ["OUTREACH_PROJECT_DIR"] = self._old_env
        shutil.rmtree(self._tmpdir)

    def _reload_queue(self):
        import src.reddit.shared.project_paths as project_paths
        import src.reddit.shared.utils as utils
        import src.reddit.runtime.review_queue as review_queue

        importlib.reload(project_paths)
        importlib.reload(utils)
        return importlib.reload(review_queue)

    def test_stage_action_uses_status_folder_and_run_manifest(self):
        queue = self._reload_queue()
        reddit_dir = Path(self._tmpdir) / "reddit"

        action = queue.stage_action(
            "run-123",
            {
                "account": "maintainer_one",
                "action_type": "comment",
                "username": "prospect_user",
                "message": "Helpful reply",
                "permalink": "https://reddit.com/test",
            },
        )

        action_path = Path(action["_path"])
        expected_status_dir = (reddit_dir / "output" / "actions" / "by_status" / "pending_review").resolve()
        self.assertTrue(action_path.exists())
        self.assertEqual(action_path.parent.name, "pending_review")
        self.assertEqual(action_path.parent.resolve(), expected_status_dir)

        manifest_path = reddit_dir / "output" / "actions" / "by_run" / "run-123" / "manifest.json"
        self.assertTrue(manifest_path.exists())

        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["counts_by_status"], {"pending_review": 1})
        self.assertEqual(manifest["actions"][0]["id"], action["id"])
        expected_artifact_path = os.path.relpath(
            action_path.resolve(),
            (reddit_dir / "output").resolve(),
        )
        self.assertEqual(
            manifest["actions"][0]["artifact_path"],
            expected_artifact_path,
        )

    def test_update_action_status_moves_file_between_status_buckets(self):
        queue = self._reload_queue()
        reddit_dir = Path(self._tmpdir) / "reddit"

        action = queue.stage_action(
            "run-456",
            {
                "account": "maintainer_two",
                "action_type": "dm",
                "username": "curious_user",
                "message": "Could share the repo if useful.",
            },
        )
        original_path = Path(action["_path"])

        updated = queue.update_action_status(action["id"], "approved")

        self.assertIsNotNone(updated)
        updated_path = Path(updated["_path"])
        self.assertEqual(updated_path.parent.name, "approved")
        self.assertTrue(updated_path.exists())
        self.assertFalse(original_path.exists())

        manifest_path = reddit_dir / "output" / "actions" / "by_run" / "run-456" / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["counts_by_status"], {"approved": 1})
        self.assertEqual(manifest["actions"][0]["status"], "approved")


if __name__ == "__main__":
    unittest.main()
