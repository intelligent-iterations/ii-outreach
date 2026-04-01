import os
from pathlib import Path


PROJECT_DIR_ENV = "OUTREACH_PROJECT_DIR"
MODULE_DIR = str(Path(__file__).resolve().parents[1])
REPO_DIR = str(Path(__file__).resolve().parents[3])


def _resolve_project_root() -> Path:
    raw = os.getenv(PROJECT_DIR_ENV, "").strip()
    if not raw:
        return Path(REPO_DIR)

    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return candidate


PROJECT_ROOT = str(_resolve_project_root())
PROJECT_DIR = str((Path(PROJECT_ROOT) / "reddit").resolve()) if os.getenv(PROJECT_DIR_ENV, "").strip() else PROJECT_ROOT
