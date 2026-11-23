"""Persistente Rekordliste (JSON-Datei, atomar geschrieben).

Rekorde gelten je Spielmodus und Ziel:

* ``energy`` – Ziel in Wh, Wertung = Zeit bis zum Ziel in Sekunden (weniger ist besser)
* ``time``   – Ziel in Sekunden, Wertung = erzeugte Energie in mWh (mehr ist besser)
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime

log = logging.getLogger(__name__)
MAX_ENTRIES = 200
HIGHER_IS_BETTER = {"energy": False, "time": True}


def _normalize(entry: dict) -> dict | None:
    """Bringt auch Einträge der ersten Dateiversion (nur Energie-Rennen) ins heutige Format."""
    if not isinstance(entry, dict):
        return None
    entry = dict(entry)
    if "mode" not in entry and "target_wh" in entry and "seconds" in entry:
        entry["mode"] = "energy"
        entry["goal"] = entry.pop("target_wh")
        entry["score"] = entry["seconds"]
    try:
        if entry["mode"] not in HIGHER_IS_BETTER:
            return None
        entry["goal"] = float(entry["goal"])
        entry["score"] = float(entry["score"])
    except (KeyError, TypeError, ValueError):
        return None
    return entry


class ResultsStore:
    def __init__(self, path: str | None):
        self._path = path
        self._lock = threading.Lock()
        self._entries: list[dict] = []
        if path:
            self._load()

    def _load(self) -> None:
        try:
            with open(self._path, encoding="utf-8") as fh:
                data = json.load(fh)
            entries = (_normalize(e) for e in data.get("results", []))
            self._entries = [e for e in entries if e]
        except FileNotFoundError:
            pass
        except (OSError, ValueError, AttributeError) as exc:
            log.warning("Rekordliste %s nicht lesbar (%s) – starte leer", self._path, exc)

    def _save(self) -> None:
        if not self._path:
            return
        tmp = self._path + ".tmp"
        try:
            os.makedirs(os.path.dirname(self._path), exist_ok=True)
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump({"results": self._entries}, fh, ensure_ascii=False, indent=1)
            os.replace(tmp, self._path)
        except OSError as exc:
            log.warning("Rekordliste konnte nicht gespeichert werden: %s", exc)

    def _matching(self, mode: str, goal: float) -> list[dict]:
        return [e for e in self._entries
                if e["mode"] == mode and abs(e["goal"] - goal) < 1e-9]

    @staticmethod
    def _best_of(mode: str, entries: list[dict]) -> dict:
        pick = max if HIGHER_IS_BETTER[mode] else min
        return pick(entries, key=lambda e: e["score"])

    def best(self, mode: str, goal: float) -> dict | None:
        """Bestes Ergebnis für genau diesen Modus und dieses Ziel (andere sind nicht vergleichbar)."""
        with self._lock:
            entries = self._matching(mode, float(goal))
            return dict(self._best_of(mode, entries)) if entries else None

    def add(self, result: dict) -> bool:
        """Speichert ein Ergebnis und liefert True, wenn es ein neuer Rekord ist."""
        entry = _normalize(result)
        if entry is None:
            raise ValueError("Ergebnis braucht mode, goal und score")
        entry.setdefault("date", datetime.now().astimezone().isoformat(timespec="seconds"))
        with self._lock:
            previous = self._matching(entry["mode"], entry["goal"])
            if not previous:
                is_record = True
            elif HIGHER_IS_BETTER[entry["mode"]]:
                is_record = entry["score"] > self._best_of(entry["mode"], previous)["score"]
            else:
                is_record = entry["score"] < self._best_of(entry["mode"], previous)["score"]
            self._entries.append(entry)
            del self._entries[:-MAX_ENTRIES]
            self._save()
        return is_record
