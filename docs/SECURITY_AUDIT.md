# Security Audit

Date: 2026-03-30

Scope:

- shared repo surface
- Docker build context
- ignore rules
- operator docs
- local runtime model

## Result

DONE_WITH_CONCERNS

The shared scaffolding is publishable after the hygiene fixes in this audit. The remaining risk is operational: this system intentionally supports local browser cookies and local credential files, so each operator still needs to keep `projects/<slug>/` private and rerun onboarding on their own machine.

## Findings

### 1. Local build artifacts could leak into commits or build context

Status: fixed

Problem:

- The repo had local nested virtualenvs and Python cache directories on disk.
- The ignore rules were too narrow for a "publishable scaffolding" standard.

Fix:

- Expanded `.gitignore` to cover recursive `.venv`, `__pycache__`, `.pytest_cache`, compiled Python files, and common coverage/cache artifacts.
- Expanded `.dockerignore` to exclude recursive local env and cache artifacts from container builds.
- Cleaned generated cache directories from the working tree after the audit edits.

### 2. Security posture was implicit, not documented

Status: fixed

Problem:

- The repo explained project isolation in several docs, but there was no single security policy file that made the trust boundary explicit.

Fix:

- Added `SECURITY.md`.
- Documented the hard split between publishable scaffolding and local-only project state.

### 3. Private project state is still a high-value local target

Status: accepted risk

Problem:

- The system stores browser cookies, staged actions, and optional credentials under `projects/<slug>/`.
- That is correct for the product design, but it means operator machines need basic local hygiene.

Guidance:

- Prefer per-project `.env` files over plaintext passwords in project config JSON.
- Keep `projects/<slug>/` out of any public backup or sync surface.
- Re-run onboarding instead of moving cookies across machines.

## Files Changed In This Audit

- `.gitignore`
- `.dockerignore`
- `SECURITY.md`
- `docs/SECURITY_AUDIT.md`
- `README.md`

## Residual Concerns

- The runtime still supports config-based passwords inside gitignored project files. That is acceptable for local operation, but `.env` remains the safer default.
- Browser automation sessions are powerful. Anyone with access to a project's `data/` directories can likely act as that operator until the session expires.
