import json
import tempfile
import unittest
from pathlib import Path

from zendriver import cdp

from src.x.shared.browser_cookies import (
    detect_cookie_file_format,
    load_browser_cookies,
    parse_json_cookie_export,
    save_browser_cookies,
)


class _FakeCookieJar:
    def __init__(self):
        self.set_batches = []
        self.cookies = []

    async def set_all(self, cookies):
        self.set_batches.append(cookies)

    async def get_all(self, requests_cookie_format=False):
        return self.cookies


class _FakeBrowser:
    def __init__(self):
        self.cookies = _FakeCookieJar()


class BrowserCookiesTests(unittest.IsolatedAsyncioTestCase):
    def test_detect_cookie_file_format(self):
        with tempfile.TemporaryDirectory() as tmp:
            json_path = Path(tmp) / "cookies.json"
            json_path.write_text("  []")
            pickle_path = Path(tmp) / "cookies.dat"
            pickle_path.write_bytes(b"\x80\x04fake")

            self.assertEqual(detect_cookie_file_format(str(json_path)), "json")
            self.assertEqual(detect_cookie_file_format(str(pickle_path)), "unsupported")

    def test_parse_json_cookie_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = Path(tmp) / "cookies.json"
            cookies_path.write_text(json.dumps([
                {
                    "name": "auth_token",
                    "value": "secret",
                    "domain": ".x.com",
                    "path": "/",
                    "secure": True,
                    "httpOnly": True,
                    "sameSite": "Lax",
                    "expires": 1774487001,
                }
            ]))

            cookie_params = parse_json_cookie_export(str(cookies_path))

            self.assertEqual(len(cookie_params), 1)
            cookie = cookie_params[0]
            self.assertEqual(cookie.name, "auth_token")
            self.assertEqual(cookie.domain, ".x.com")
            self.assertTrue(cookie.secure)
            self.assertTrue(cookie.http_only)
            self.assertEqual(cookie.same_site, cdp.network.CookieSameSite.LAX)

    async def test_load_browser_cookies_uses_set_all_for_json_exports(self):
        browser = _FakeBrowser()
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = Path(tmp) / "cookies.json"
            cookies_path.write_text(json.dumps([
                {"name": "session", "value": "abc", "domain": ".x.com", "path": "/"}
            ]))

            cookie_format, cookie_count = await load_browser_cookies(browser, str(cookies_path))

            self.assertEqual(cookie_format, "json")
            self.assertEqual(cookie_count, 1)
            self.assertEqual(len(browser.cookies.set_batches), 1)

    async def test_load_browser_cookies_rejects_pickle_files(self):
        browser = _FakeBrowser()
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = Path(tmp) / "cookies.dat"
            cookies_path.write_bytes(b"\x80\x04fake")

            with self.assertRaisesRegex(ValueError, "Only JSON cookie exports are allowed"):
                await load_browser_cookies(browser, str(cookies_path))

    async def test_save_browser_cookies_writes_json_export(self):
        browser = _FakeBrowser()
        browser.cookies.cookies = [
            cdp.network.Cookie(
                name="session",
                value="abc",
                domain=".x.com",
                path="/",
                size=10,
                http_only=True,
                secure=True,
                session=False,
                priority=cdp.network.CookiePriority.MEDIUM,
                same_party=False,
                source_scheme=cdp.network.CookieSourceScheme.SECURE,
                source_port=443,
                expires=1774487001.0,
                same_site=cdp.network.CookieSameSite.LAX,
                partition_key=None,
                partition_key_opaque=None,
            )
        ]
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = Path(tmp) / "cookies.json"

            cookie_format, cookie_count = await save_browser_cookies(browser, str(cookies_path))

            self.assertEqual(cookie_format, "json")
            self.assertEqual(cookie_count, 1)
            payload = json.loads(cookies_path.read_text())
            self.assertEqual(payload[0]["name"], "session")
            self.assertEqual(payload[0]["domain"], ".x.com")
            self.assertEqual(payload[0]["sameSite"], "Lax")
