import os
from pathlib import Path


PROJECT_DIR_ENV = "OUTREACH_PROJECT_DIR"
REPO_DIR = str(Path(__file__).resolve().parents[2])


def _resolve_project_dir() -> str:
    raw = os.getenv(PROJECT_DIR_ENV, "").strip()
    if not raw:
        return REPO_DIR

    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return str(candidate)


PROJECT_DIR = _resolve_project_dir()
