import importlib
import os
import unittest
from pathlib import Path


REPO_DIR = Path(__file__).resolve().parents[1]


class ProjectPathsTests(unittest.TestCase):
    def setUp(self):
        self._old_env = os.environ.get("OUTREACH_PROJECT_DIR")

    def tearDown(self):
        if self._old_env is None:
            os.environ.pop("OUTREACH_PROJECT_DIR", None)
        else:
            os.environ["OUTREACH_PROJECT_DIR"] = self._old_env

    def _reload(self):
        import src.shared.project_paths as project_paths

        return importlib.reload(project_paths)

    def test_default_project_dir_is_repo_root(self):
        os.environ.pop("OUTREACH_PROJECT_DIR", None)

        module = self._reload()

        self.assertEqual(Path(module.REPO_DIR), REPO_DIR)
        self.assertEqual(Path(module.PROJECT_DIR), REPO_DIR)

    def test_absolute_project_dir_is_respected(self):
        custom_project = (REPO_DIR / "projects" / "content-engine").resolve()
        os.environ["OUTREACH_PROJECT_DIR"] = str(custom_project)

        module = self._reload()

        self.assertEqual(Path(module.PROJECT_DIR), custom_project)
