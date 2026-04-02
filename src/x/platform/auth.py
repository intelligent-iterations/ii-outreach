import asyncio
import os
import platform

import zendriver as zd
from zendriver.core.config import Config as ZDConfig

from src.x.shared.browser_cookies import load_browser_cookies, save_browser_cookies
from src.x.shared.utils import BASE_DIR, human_type, random_delay, take_error_screenshot, log

CHROME_PATH_MACOS = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


async def _start_browser(headless=False):
    """Start Chrome with a conservative fallback when the default attach fails."""
    zd_kwargs = {"headless": headless, "browser_connection_timeout": 10.0, "browser_connection_max_tries": 10}
    if platform.system() == "Darwin" and os.path.exists(CHROME_PATH_MACOS):
        zd_kwargs["browser_executable_path"] = CHROME_PATH_MACOS
    elif platform.system() == "Linux" and os.path.exists("/usr/bin/chromium"):
        zd_kwargs["browser_executable_path"] = "/usr/bin/chromium"
        zd_kwargs["no_sandbox"] = True
        zd_kwargs["browser_args"] = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-setuid-sandbox"]

    try:
        return await zd.start(ZDConfig(**zd_kwargs))
    except Exception as exc:
        fallback_kwargs = dict(zd_kwargs)
        fallback_args = list(fallback_kwargs.get("browser_args", []))
        for arg in ("--no-sandbox", "--disable-dev-shm-usage", "--disable-setuid-sandbox"):
            if arg not in fallback_args:
                fallback_args.append(arg)
        fallback_kwargs["browser_args"] = fallback_args
        fallback_kwargs["no_sandbox"] = True
        log.warning(f"Browser attach failed ({exc}). Retrying with no-sandbox fallback...")
        return await zd.start(ZDConfig(**fallback_kwargs))


async def _open_page(browser, url: str, timeout_seconds: float = 30.0):
    """Open a page with a bounded timeout so navigation cannot hang forever."""
    return await asyncio.wait_for(browser.get(url), timeout=timeout_seconds)


def _resolve_account(account):
    username = os.getenv("X_USERNAME") or account.get("username", "")
    password = os.getenv("X_PASSWORD") or account.get("password", "")
    cookies_rel = os.getenv("X_COOKIES_PATH") or account.get(
        "cookies_path",
        f"auth/cookies_{username}.json" if username else "auth/cookies_x.json",
    )
    cookies_path = cookies_rel if os.path.isabs(cookies_rel) else os.path.join(BASE_DIR, cookies_rel)

    return {
        **account,
        "username": username,
        "password": password,
        "cookies_path": cookies_rel,
        "_cookies_abs_path": cookies_path,
    }


async def login(config, account, headless=False):
    """Login to X with a specific account. Returns (browser, page).

    Tries local cookies first, falls back to fresh login using config/env credentials.
    """
    account = _resolve_account(account)
    browser = await _start_browser(headless=headless)

    cookies_path = account["_cookies_abs_path"]

    if os.path.exists(cookies_path):
        log.step("🔑", f"Trying local cookies for @{account['username']}...")
        try:
            page = await _open_page(browser, "https://x.com")
            cookie_format, cookie_count = await load_browser_cookies(browser, cookies_path)
            if cookie_count is None:
                log.info(f"Loaded {cookie_format} cookies from {cookies_path}")
            else:
                log.info(f"Loaded {cookie_count} {cookie_format} cookies from {cookies_path}")
            for attempt in range(3):
                page = await _open_page(browser, "https://x.com/home")
                await asyncio.sleep(config["delays"]["page_load_wait_seconds"] + attempt)
                if await _is_logged_in(page, account):
                    log.success(f"Cookie login successful for @{account['username']}!")
                    return browser, page
            else:
                log.warning("Local cookies expired, trying fresh login...")
        except Exception as e:
            log.error(f"Local cookie load failed: {e}")

    if not account["username"] or not account["password"]:
        raise RuntimeError(
            "X credentials missing. Set X_USERNAME/X_PASSWORD in x/.env "
            "or provide username/password in x/config.json before onboarding."
        )

    # Fresh login
    page = await _do_login(browser, config, account)

    # Save cookies
    try:
        os.makedirs(os.path.dirname(cookies_path), exist_ok=True)
        cookie_format, cookie_count = await save_browser_cookies(browser, cookies_path)
        log.success(f"Saved {cookie_count} {cookie_format} cookies to {cookies_path}")
    except Exception as e:
        log.error(f"Failed to save cookies: {e}")

    return browser, page


async def _is_logged_in(page, account):
    """Check if we're logged in by looking for home timeline indicators."""
    try:
        # Look for "Post" button or compose tweet area (only visible when logged in)
        for indicator in ["Post", "What is happening", "Home"]:
            try:
                el = await page.find(indicator, best_match=True, timeout=5)
                if el:
                    log.info(f"Found '{indicator}' - logged in")
                    return True
            except Exception:
                continue
    except Exception:
        pass

    # Check URL - if we're on /home we're likely logged in
    try:
        current_url = await page.evaluate("() => window.location.href")
        if "/home" in current_url:
            return True
    except Exception:
        pass

    return False


async def _do_login(browser, config, account):
    """Perform fresh login with username/password."""
    log.step("🔐", f"Logging in as @{account['username']}...")
    page = await _open_page(browser, "https://x.com/i/flow/login")
    await asyncio.sleep(config["delays"]["page_load_wait_seconds"])

    username = account["username"]
    password = account["password"]

    try:
        # Step 1: Enter username/email
        log.step("📝", "Looking for username field...")
        await asyncio.sleep(2)

        # X uses input[autocomplete="username"] for the first field
        username_field = await page.select('input[autocomplete="username"]', timeout=15)
        await username_field.click()
        await random_delay(0.3, 0.8)
        await human_type(username_field, username, config)
        log.info(f"Typed username: {username}")

        await random_delay(0.5, 1.0)

        # Click Next button
        next_btn = await page.find("Next", best_match=True, timeout=10)
        await next_btn.click()
        log.info("Clicked Next")

        await asyncio.sleep(2)

        # Step 2: Check for unusual activity / phone verification prompt
        try:
            phone_check = await page.find("phone", best_match=True, timeout=3)
            if phone_check:
                log.warning("*** PHONE VERIFICATION REQUIRED ***")
                log.warning("Please complete verification manually in the browser.")
                log.warning("Waiting up to 120 seconds...")
                for _ in range(24):
                    await asyncio.sleep(5)
                    # Check if we moved past verification
                    try:
                        pwd_field = await page.select('input[type="password"]', timeout=2)
                        if pwd_field:
                            break
                    except:
                        pass
                    if await _is_logged_in(page, account):
                        return page
        except Exception:
            pass

        # Step 3: Enter password
        log.step("🔒", "Looking for password field...")
        password_field = await page.select('input[type="password"]', timeout=15)
        await password_field.click()
        await random_delay(0.3, 0.8)
        await human_type(password_field, password, config)
        log.info("Typed password")

        await random_delay(0.5, 1.0)

        # Click Log in button
        login_btn = await page.find("Log in", best_match=True, timeout=10)
        await login_btn.click()
        log.info("Clicked Log in")

        await asyncio.sleep(5)

        # Check for 2FA
        try:
            twofa = await page.find("confirmation code", best_match=True, timeout=3)
            if twofa:
                log.warning("*** 2FA DETECTED ***")
                log.warning("Please enter 2FA code manually.")
                log.warning("Waiting up to 120 seconds...")
                for _ in range(24):
                    await asyncio.sleep(5)
                    if await _is_logged_in(page, account):
                        log.success("2FA complete, logged in!")
                        return page
                log.error("2FA timeout")
        except Exception:
            pass

        # Verify login succeeded
        if await _is_logged_in(page, account):
            log.success("Login successful!")
            return page
        else:
            log.warning("Login may have failed - could not confirm logged-in state")
            await take_error_screenshot(page, "login_unconfirmed")
            return page

    except Exception as e:
        log.error(f"Login error: {e}")
        await take_error_screenshot(page, "login_error")
        raise


async def nuclear_tab_reset(browser, old_page):
    """Close current tab and open fresh one to clear any stuck state."""
    try:
        new_page = await browser.get("https://x.com", new_tab=True)
        await old_page.close()
        await asyncio.sleep(1)
        return new_page
    except Exception as e:
        log.error(f"Nuclear tab reset failed: {e}")
        return old_page
