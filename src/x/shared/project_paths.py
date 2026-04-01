import os
from pathlib import Path


PROJECT_DIR_ENV = "OUTREACH_PROJECT_DIR"
MODULE_DIR = str(Path(__file__).resolve().parents[1])
REPO_DIR = str(Path(__file__).resolve().parents[3])


def _resolve_project_root() -> Path:
    raw = os.getenv(PROJECT_DIR_ENV, "").strip()
    if not raw:
        return Path(REPO_DIR)

    project_root = Path(raw).expanduser()
    if not project_root.is_absolute():
        project_root = (Path.cwd() / project_root).resolve()
    else:
        project_root = project_root.resolve()
    return project_root


PROJECT_ROOT = str(_resolve_project_root())
PROJECT_DIR = str((Path(PROJECT_ROOT) / "x").resolve()) if os.getenv(PROJECT_DIR_ENV, "").strip() else PROJECT_ROOT
