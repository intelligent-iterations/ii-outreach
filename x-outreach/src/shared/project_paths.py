import os
from pathlib import Path


PROJECT_DIR_ENV = "OUTREACH_PROJECT_DIR"
MODULE_DIR = str(Path(__file__).resolve().parents[2])
REPO_DIR = str(Path(__file__).resolve().parents[3])


def _resolve_project_dir() -> str:
    raw = os.getenv(PROJECT_DIR_ENV, "").strip()
    if not raw:
        return MODULE_DIR

    project_root = Path(raw).expanduser()
    if not project_root.is_absolute():
        project_root = (Path.cwd() / project_root).resolve()
    else:
        project_root = project_root.resolve()
    return str((project_root / "x-outreach").resolve())


PROJECT_DIR = _resolve_project_dir()
