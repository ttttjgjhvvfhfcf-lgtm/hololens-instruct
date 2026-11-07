"""Konfiguration laden, mit Standardwerten auffüllen und prüfen."""
from __future__ import annotations

import json
import os
import re
from copy import deepcopy

COLORS = ("red", "cyan", "green", "magenta", "orange", "blue")
SENSOR_TYPES = ("sim", "ina219", "push")

DEFAULTS = {
    "title": "watt champion",
    "host": "127.0.0.1",
    "port": 8080,
    "target_wh": 1.0,
    "countdown_s": 3,
    "tie_threshold_pct": 10,
    "sample_hz": 10,
    "results_file": "data/results.json",
    "sponsor_logo": None,
    "sensor": {"type": "sim"},
    "players": [
        {"id": "anna", "name": "Anna", "color": "red", "sim_w": 32},
        {"id": "ben", "name": "Ben", "color": "cyan", "sim_w": 26},
    ],
}


class ConfigError(ValueError):
    """Die Konfiguration ist ungültig."""


def load_config(path: str | None) -> dict:
    """Liest ``path`` (JSON) und legt die Werte über die Standardwerte."""
    cfg = deepcopy(DEFAULTS)
    base_dir = os.path.dirname(os.path.abspath(path)) if path else os.getcwd()
    if path:
        try:
            with open(path, encoding="utf-8") as fh:
                user = json.load(fh)
        except FileNotFoundError:
            raise ConfigError(f"Konfigurationsdatei nicht gefunden: {path}") from None
        except json.JSONDecodeError as exc:
            raise ConfigError(f"{path} ist kein gültiges JSON: {exc}") from None
        if not isinstance(user, dict):
            raise ConfigError(f"{path}: Oberste Ebene muss ein JSON-Objekt sein")
        unknown = set(user) - set(DEFAULTS)
        if unknown:
            raise ConfigError(f"{path}: unbekannte Schlüssel: {', '.join(sorted(unknown))}")
        cfg.update(user)
    return validate(cfg, base_dir)


def _number(cfg: dict, key: str, lo: float, hi: float) -> float:
    value = cfg[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"'{key}' muss eine Zahl sein")
    if not lo <= value <= hi:
        raise ConfigError(f"'{key}' muss zwischen {lo} und {hi} liegen")
    return value


def _address(value) -> int:
    try:
        addr = int(value, 0) if isinstance(value, str) else int(value)
    except (TypeError, ValueError):
        raise ConfigError(f"Ungültige I2C-Adresse: {value!r}") from None
    if not 0x03 <= addr <= 0x77:
        raise ConfigError(f"I2C-Adresse außerhalb 0x03..0x77: {value!r}")
    return addr


def validate(cfg: dict, base_dir: str) -> dict:
    _number(cfg, "port", 1, 65535)
    _number(cfg, "target_wh", 0.001, 10000)
    _number(cfg, "countdown_s", 0, 60)
    _number(cfg, "tie_threshold_pct", 0, 100)
    _number(cfg, "sample_hz", 1, 100)
    if not isinstance(cfg["title"], str) or not cfg["title"].strip():
        raise ConfigError("'title' darf nicht leer sein")

    players = cfg["players"]
    if not isinstance(players, list) or not 2 <= len(players) <= 4:
        raise ConfigError("'players' braucht 2 bis 4 Einträge")
    seen = set()
    for idx, player in enumerate(players):
        if not isinstance(player, dict):
            raise ConfigError("Jeder Eintrag in 'players' muss ein Objekt sein")
        pid = str(player.get("id", "")).strip()
        if not re.fullmatch(r"[a-z0-9_-]+", pid):
            raise ConfigError(f"players[{idx}]: 'id' nur aus a-z, 0-9, _ und -")
        if pid in seen:
            raise ConfigError(f"players[{idx}]: doppelte id '{pid}'")
        seen.add(pid)
        player["id"] = pid
        player["name"] = str(player.get("name") or pid).strip()
        player.setdefault("color", COLORS[idx % len(COLORS)])
        if player["color"] not in COLORS:
            raise ConfigError(f"players[{idx}]: color muss eine von {', '.join(COLORS)} sein")

    sensor = cfg["sensor"]
    if not isinstance(sensor, dict) or sensor.get("type") not in SENSOR_TYPES:
        raise ConfigError(f"'sensor.type' muss eine von {', '.join(SENSOR_TYPES)} sein")
    if sensor["type"] == "ina219":
        shunt = sensor.setdefault("shunt_ohm", 0.1)
        if not isinstance(shunt, (int, float)) or shunt <= 0:
            raise ConfigError("'sensor.shunt_ohm' muss größer als 0 sein")
        sensor.setdefault("bus", 1)
        for idx, player in enumerate(players):
            if "address" not in player:
                raise ConfigError(f"players[{idx}]: für ina219 fehlt 'address' (z. B. \"0x40\")")
            player["address"] = _address(player["address"])
        if len({p["address"] for p in players}) != len(players):
            raise ConfigError("Jeder Spieler braucht eine eigene INA219-Adresse")
    if sensor["type"] == "push":
        sensor.setdefault("timeout_s", 2.0)

    results = cfg["results_file"]
    cfg["results_file"] = None
    if results:
        cfg["results_file"] = results if os.path.isabs(results) else os.path.join(base_dir, results)
    cfg["base_dir"] = base_dir
    return cfg
