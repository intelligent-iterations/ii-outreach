import json
from pathlib import Path

from zendriver import cdp


def detect_cookie_file_format(cookies_path: str) -> str:
    prefix = Path(cookies_path).read_bytes()[:64].lstrip()
    if not prefix:
        raise ValueError(f"Cookie file is empty: {cookies_path}")
    if prefix[:1] in (b"[", b"{"):
        return "json"
    return "unsupported"


def _coerce_enum(enum_cls, value):
    if value in (None, ""):
        return None
    if isinstance(value, enum_cls):
        return value
    value_str = str(value).strip().lower()
    for member in enum_cls:
        if value_str in {member.name.lower(), str(member.value).lower()}:
            return member
    return None


def _cookie_records(payload) -> list[dict]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("cookies", "Cookies"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    raise ValueError("Cookie JSON must be a list or an object with a 'cookies' list")


def parse_json_cookie_export(cookies_path: str) -> list[cdp.network.CookieParam]:
    payload = json.loads(Path(cookies_path).read_text())
    cookie_params = []

    for record in _cookie_records(payload):
        name = record.get("name")
        value = record.get("value")
        if not name or value is None:
            continue

        kwargs = {
            "name": str(name),
            "value": str(value),
            "path": record.get("path") or "/",
        }

        url = record.get("url")
        domain = record.get("domain")
        if url:
            kwargs["url"] = str(url)
        elif domain:
            kwargs["domain"] = str(domain)
        else:
            raise ValueError(f"Cookie '{name}' is missing both url and domain")

        if "secure" in record:
            kwargs["secure"] = bool(record.get("secure"))

        http_only = record.get("httpOnly", record.get("http_only"))
        if http_only is not None:
            kwargs["http_only"] = bool(http_only)

        same_site = _coerce_enum(cdp.network.CookieSameSite, record.get("sameSite", record.get("same_site")))
        if same_site is not None:
            kwargs["same_site"] = same_site

        priority = _coerce_enum(cdp.network.CookiePriority, record.get("priority"))
        if priority is not None:
            kwargs["priority"] = priority

        source_scheme = _coerce_enum(
            cdp.network.CookieSourceScheme,
            record.get("sourceScheme", record.get("source_scheme")),
        )
        if source_scheme is not None:
            kwargs["source_scheme"] = source_scheme

        expires = record.get("expires")
        if expires not in (None, "", 0, "0"):
            kwargs["expires"] = cdp.network.TimeSinceEpoch(float(expires))

        same_party = record.get("sameParty", record.get("same_party"))
        if same_party is not None:
            kwargs["same_party"] = bool(same_party)

        source_port = record.get("sourcePort", record.get("source_port"))
        if source_port not in (None, ""):
            kwargs["source_port"] = int(source_port)

        cookie_params.append(cdp.network.CookieParam(**kwargs))

    if not cookie_params:
        raise ValueError(f"No usable cookies found in {cookies_path}")

    return cookie_params


def serialize_cookie(cookie) -> dict:
    return {
        "name": getattr(cookie, "name", ""),
        "value": getattr(cookie, "value", ""),
        "domain": getattr(cookie, "domain", ""),
        "path": getattr(cookie, "path", "/"),
        "secure": bool(getattr(cookie, "secure", False)),
        "httpOnly": bool(getattr(cookie, "http_only", False)),
        "sameSite": getattr(getattr(cookie, "same_site", None), "value", None),
        "priority": getattr(getattr(cookie, "priority", None), "value", None),
        "sourceScheme": getattr(getattr(cookie, "source_scheme", None), "value", None),
        "sourcePort": getattr(cookie, "source_port", None),
        "sameParty": bool(getattr(cookie, "same_party", False)),
        "expires": getattr(cookie, "expires", None),
    }


async def save_browser_cookies(browser, cookies_path: str) -> tuple[str, int]:
    cookies = await browser.cookies.get_all(requests_cookie_format=False)
    payload = []
    for cookie in cookies:
        record = {key: value for key, value in serialize_cookie(cookie).items() if value not in (None, "")}
        payload.append(record)

    Path(cookies_path).parent.mkdir(parents=True, exist_ok=True)
    Path(cookies_path).write_text(json.dumps(payload, indent=2))
    return "json", len(payload)


async def load_browser_cookies(browser, cookies_path: str) -> tuple[str, int | None]:
    cookie_format = detect_cookie_file_format(cookies_path)
    if cookie_format != "json":
        raise ValueError(
            f"Unsupported cookie file format for {cookies_path}. "
            "Only JSON cookie exports are allowed."
        )

    cookie_params = parse_json_cookie_export(cookies_path)
    await browser.cookies.set_all(cookie_params)
    return cookie_format, len(cookie_params)
