"""
Minimal review UI for staged outreach actions.
"""

from __future__ import annotations

import argparse
import html
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from src.runtime.review_queue import get_action, list_actions, update_action_status
from src.shared.utils import BASE_DIR, REPO_DIR


def render_page(message: str = "") -> bytes:
    actions = list_actions()
    rows = []
    for action in actions:
        status = html.escape(action.get("status", ""))
        username = html.escape(action.get("username", ""))
        account = html.escape(action.get("account", ""))
        strategy = html.escape(action.get("strategy", ""))
        action_type = html.escape(action.get("action_type", ""))
        body = html.escape(action.get("message", ""))
        permalink = html.escape(action.get("permalink", ""))
        subject = html.escape(action.get("subject", ""))
        action_id = html.escape(action.get("id", ""))
        rows.append(
            f"""
            <div class="card">
              <div class="meta">
                <strong>{action_type.upper()}</strong> · <code>{status}</code> · u/{username} · {account} · {strategy}
              </div>
              <div class="submeta">{permalink}</div>
              {f'<div class="subject"><strong>Subject:</strong> {subject}</div>' if subject else ''}
              <pre>{body}</pre>
              <form method="POST" action="/approve">
                <input type="hidden" name="id" value="{action_id}">
                <button>Approve</button>
              </form>
              <form method="POST" action="/reject">
                <input type="hidden" name="id" value="{action_id}">
                <button class="danger">Reject</button>
              </form>
            </div>
            """
        )

    page = f"""
    <html>
    <head>
      <title>Outreach Review</title>
      <style>
        body {{ font-family: sans-serif; background: #111; color: #eee; margin: 24px; }}
        .topbar {{ display:flex; gap:12px; align-items:center; margin-bottom:20px; }}
        .card {{ background:#1b1b1b; border:1px solid #333; border-radius:10px; padding:16px; margin-bottom:16px; }}
        .meta {{ margin-bottom:8px; color:#ddd; }}
        .submeta {{ margin-bottom:10px; color:#999; font-size:13px; }}
        pre {{ white-space:pre-wrap; background:#0d0d0d; padding:12px; border-radius:8px; }}
        form {{ display:inline-block; margin-right:8px; }}
        button {{ background:#eaeaea; color:#111; border:none; border-radius:6px; padding:8px 12px; cursor:pointer; }}
        .danger {{ background:#ffb3b3; }}
        .dispatch {{ background:#9be29b; }}
        .message {{ color:#9be29b; }}
        code {{ background:#222; padding:2px 6px; border-radius:4px; }}
      </style>
    </head>
    <body>
      <div class="topbar">
        <h1>Outreach Review</h1>
        <form method="POST" action="/dispatch-approved"><button class="dispatch">Dispatch Approved</button></form>
      </div>
      <div class="message">{html.escape(message)}</div>
      {''.join(rows) if rows else '<p>No staged actions found.</p>'}
    </body>
    </html>
    """
    return page.encode("utf-8")


class ReviewHandler(BaseHTTPRequestHandler):
    def _send_html(self, body: bytes, code: int = 200):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        message = parse_qs(parsed.query).get("message", [""])[0]
        self._send_html(render_page(message))

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        data = parse_qs(raw)

        if self.path == "/approve":
            action_id = data.get("id", [""])[0]
            update_action_status(action_id, "approved")
            self._redirect("approved")
            return

        if self.path == "/reject":
            action_id = data.get("id", [""])[0]
            update_action_status(action_id, "rejected")
            self._redirect("rejected")
            return

        if self.path == "/dispatch-approved":
            proc = subprocess.run(
                [sys.executable, "-m", "src.main", "--dispatch-approved"],
                cwd=REPO_DIR,
                capture_output=True,
                text=True,
            )
            message = proc.stdout.strip() or proc.stderr.strip() or "dispatch complete"
            self._redirect(message[:180])
            return

        self._send_html(render_page("unknown action"), code=404)

    def _redirect(self, message: str):
        self.send_response(303)
        self.send_header("Location", f"/?message={message}")
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(description="Outreach review UI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), ReviewHandler)
    print(f"Review UI running at http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
