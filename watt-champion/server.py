#!/usr/bin/env python3
"""watt champion – Start des Servers.

    python3 server.py                      # Standardkonfiguration (Simulation)
    python3 server.py --config config.json
"""
import argparse
import logging
import os
import signal
import sys

from wattchamp.app import App
from wattchamp.config import ConfigError, load_config
from wattchamp.web import make_server


def _terminate(*_args):
    raise KeyboardInterrupt  # SIGTERM (systemd) wie Strg+C behandeln -> sauber aufräumen


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="watt champion Server")
    parser.add_argument("--config", help="Konfigurationsdatei (Standard: config.json neben server.py)")
    parser.add_argument("--host", help="überschreibt 'host' aus der Konfiguration")
    parser.add_argument("--port", type=int, help="überschreibt 'port' aus der Konfiguration")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    try:
        path = args.config  # ausdrücklich angegeben: muss existieren (sonst Fehlermeldung)
        if path is None:
            default = os.path.join(here, "config.json")
            path = default if os.path.exists(default) else None
        cfg = load_config(path)
        if args.host:
            cfg["host"] = args.host
        if args.port:
            cfg["port"] = args.port
        app = App(cfg)
    except (ConfigError, RuntimeError) as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 2

    server = make_server(app, cfg["host"], cfg["port"])
    app.start()
    signal.signal(signal.SIGTERM, _terminate)
    logging.getLogger("wattchamp").info(
        "Läuft auf http://%s:%d  (Sensor: %s, Ziel: %s Wh)",
        cfg["host"], cfg["port"], cfg["sensor"]["type"], cfg["target_wh"])
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        app.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
