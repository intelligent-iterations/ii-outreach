import json
import tempfile
import unittest
from pathlib import Path

from zendriver import cdp

from src.shared.browser_cookies import detect_cookie_file_format, load_browser_cookies, parse_json_cookie_export


class _FakeCookieJar:
    def __init__(self):
        self.loaded = []
        self.set_batches = []

    async def load(self, cookies_path):
        self.loaded.append(cookies_path)

    async def set_all(self, cookies):
        self.set_batches.append(cookies)


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
            self.assertEqual(detect_cookie_file_format(str(pickle_path)), "pickle")

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
            self.assertEqual(browser.cookies.loaded, [])
            self.assertEqual(len(browser.cookies.set_batches), 1)

    async def test_load_browser_cookies_uses_native_loader_for_pickle_files(self):
        browser = _FakeBrowser()
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = Path(tmp) / "cookies.dat"
            cookies_path.write_bytes(b"\x80\x04fake")

            cookie_format, cookie_count = await load_browser_cookies(browser, str(cookies_path))

            self.assertEqual(cookie_format, "pickle")
            self.assertIsNone(cookie_count)
            self.assertEqual(browser.cookies.loaded, [str(cookies_path)])
            self.assertEqual(browser.cookies.set_batches, [])
