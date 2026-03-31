import importlib
import os
import unittest
from pathlib import Path


MODULE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = MODULE_DIR.parent


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

    def test_default_project_dir_is_module_root(self):
        os.environ.pop("OUTREACH_PROJECT_DIR", None)

        module = self._reload()

        self.assertEqual(Path(module.MODULE_DIR), MODULE_DIR)
        self.assertEqual(Path(module.REPO_DIR), REPO_DIR)
        self.assertEqual(Path(module.PROJECT_DIR), MODULE_DIR)

    def test_project_dir_env_maps_to_project_x_outreach_folder(self):
        custom_project_root = (REPO_DIR / "projects" / "content-engine").resolve()
        os.environ["OUTREACH_PROJECT_DIR"] = str(custom_project_root)

        module = self._reload()

        self.assertEqual(Path(module.PROJECT_DIR), custom_project_root / "x-outreach")
