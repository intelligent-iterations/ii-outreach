#!/bin/bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <project-slug>" >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_SLUG="$1"
PROJECT_DIR="${REPO_DIR}/projects/${PROJECT_SLUG}"
PYTHON_BIN="${REPO_DIR}/.venv/bin/python3.12"

if [ ! -d "${PROJECT_DIR}" ]; then
  echo "missing project dir: ${PROJECT_DIR}" >&2
  exit 66
fi

if [ ! -x "${PYTHON_BIN}" ]; then
  echo "missing python runtime: ${PYTHON_BIN}" >&2
  exit 69
fi

mkdir -p "${PROJECT_DIR}/output/logs"

LOCK_DIR="${PROJECT_DIR}/output/.dispatch_due.lock"
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "lock held, skipping ${PROJECT_SLUG}"
  exit 0
fi

cleanup() {
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

export OUTREACH_PROJECT_DIR="${PROJECT_DIR}"
cd "${REPO_DIR}"

"${PYTHON_BIN}" -u -m src.app.main --dispatch-approved --headless
