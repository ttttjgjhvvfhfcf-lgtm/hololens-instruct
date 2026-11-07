"""Minimaler HTTP-Server: liefert die Oberfläche aus und bietet die JSON-API."""
from __future__ import annotations

import functools
import json
import logging
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

log = logging.getLogger(__name__)
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
MAX_BODY = 4096


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".woff2": "font/woff2"}
    server_version = "WattChampion"

    @property
    def app(self):
        return self.server.app

    # ------------------------------------------------------------------ Hilfen
    def _json(self, payload, status=200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 <= length <= MAX_BODY:
            self._json({"error": "Body fehlt oder ist zu groß"}, 413)
            return None
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw)
        except ValueError:
            self._json({"error": "Kein gültiges JSON"}, 400)
            return None
        if not isinstance(data, dict):
            self._json({"error": "JSON-Objekt erwartet"}, 400)
            return None
        return data

    def log_message(self, fmt, *args) -> None:
        # Die Oberfläche fragt mehrmals pro Sekunde den Zustand ab – das nicht loggen.
        if self.path.split("?")[0] != "/api/state":
            log.debug("%s %s", self.address_string(), fmt % args)

    def list_directory(self, path):  # kein Verzeichnislisting
        self.send_error(404)
        return None

    def end_headers(self) -> None:
        if not self.path.split("?")[0].endswith(".woff2"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # ------------------------------------------------------------------ Routen
    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        if path == "/api/state":
            self._json(self.app.state())
        elif path.startswith("/api/"):
            self._json({"error": "Unbekannter Endpunkt"}, 404)
        else:
            super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        if path == "/api/start":
            if self.app.race.start():
                self._json(self.app.state())
            else:
                self._json({"error": "Es läuft bereits ein Rennen"}, 409)
        elif path == "/api/reset":
            self.app.race.reset()
            self._json(self.app.state())
        elif path == "/api/measurement":
            push = getattr(self.app.sensor, "push", None)
            if push is None:
                self._json({"error": "Sensor-Typ 'push' ist nicht aktiv"}, 409)
                return
            data = self._read_json()
            if data is None:
                return
            bad = [k for k, v in data.items()
                   if v is not None and (isinstance(v, bool) or not isinstance(v, (int, float)))]
            if bad:
                self._json({"error": f"Watt-Werte müssen Zahlen sein: {', '.join(bad)}"}, 400)
                return
            unknown = push(data)
            self._json({"ok": True, "unknown_ids": unknown})
        else:
            self._json({"error": "Unbekannter Endpunkt"}, 404)


def make_server(app, host: str, port: int) -> ThreadingHTTPServer:
    handler = functools.partial(Handler, directory=STATIC_DIR)
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    server.app = app
    return server
