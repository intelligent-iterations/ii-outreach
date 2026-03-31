import argparse
import asyncio
import os
from pathlib import Path
import subprocess
import sys
import shutil


def _ensure_supported_python(argv):
    if sys.version_info >= (3, 10):
        return

    for candidate in ("python3.12", "python3.11", "python3.10"):
        path = shutil.which(candidate)
        if path:
            print(f"[BOOTSTRAP] Python {sys.version.split()[0]} is too old. Re-running onboarding with {candidate}.")
            raise SystemExit(subprocess.call([path, "-m", "src.setup_auth", *argv]))

    raise SystemExit(
        "Onboarding requires Python 3.10+. Install a newer Python and re-run this command."
    )


def _venv_python(venv_dir):
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _ensure_venv(argv):
    repo_root = Path(__file__).resolve().parents[2]
    venv_dir = repo_root / ".venv"
    venv_python = _venv_python(venv_dir)

    if Path(sys.prefix).resolve() == venv_dir.resolve():
        return

    if not venv_python.exists():
        print(f"[BOOTSTRAP] Creating virtualenv at {venv_dir}")
        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)

    requirements_path = repo_root / "requirements.txt"
    if requirements_path.exists():
        print(f"[BOOTSTRAP] Installing dependencies from {requirements_path}")
        subprocess.run(
            [str(venv_python), "-m", "pip", "install", "-r", str(requirements_path)],
            check=True,
        )

    rerun_args = list(argv)
    if "--skip-install" not in rerun_args:
        rerun_args.append("--skip-install")

    env = os.environ.copy()
    env["OUTREACH_BOOTSTRAPPED"] = "1"
    print(f"[BOOTSTRAP] Re-running onboarding inside {venv_python}")
    raise SystemExit(subprocess.call([str(venv_python), "-m", "src.setup_auth", *rerun_args], env=env))


def _install_requirements():
    requirements_path = Path(__file__).resolve().parents[2] / "requirements.txt"
    if not requirements_path.exists():
        return
    print(f"[BOOTSTRAP] Installing dependencies from {requirements_path}")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(requirements_path)],
        check=True,
    )


async def main():
    parser = argparse.ArgumentParser(description="Onboard a Reddit account and save fresh local cookies.")
    parser.add_argument("--account", type=str, help="Specific account username from config.json")
    parser.add_argument("--headless", action="store_true", help="Run headless instead of visible browser")
    parser.add_argument("--skip-install", action="store_true", help="Skip pip install during onboarding")
    args = parser.parse_args()

    _ensure_supported_python(sys.argv[1:])
    _ensure_venv(sys.argv[1:])

    if not args.skip_install:
        _install_requirements()

    try:
        from src.reddit.auth import login
        from src.shared.utils import load_config
    except ModuleNotFoundError as exc:
        if exc.name == "zendriver":
            raise SystemExit("Missing dependency 'zendriver' after bootstrap.") from exc
        raise

    config = load_config()
    accounts = config.get("accounts", [])
    if not accounts:
        raise SystemExit("No Reddit accounts configured in config.json")

    if args.account:
        accounts = [account for account in accounts if account.get("username") == args.account]
        if not accounts:
            raise SystemExit(f"Account '{args.account}' not found in config.json")

    account = accounts[0]
    browser, _page = await login(config, account, headless=args.headless)
    print(f"[AUTH] Reddit onboarding completed for {account.get('username', '<env account>')}")
    await browser.stop()


if __name__ == "__main__":
    asyncio.run(main())
