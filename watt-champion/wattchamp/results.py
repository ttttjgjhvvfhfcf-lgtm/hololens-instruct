"""Persistente Rekordliste (JSON-Datei, atomar geschrieben)."""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime

log = logging.getLogger(__name__)
MAX_ENTRIES = 200


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
            entries = data.get("results", [])
            self._entries = [e for e in entries if isinstance(e, dict) and "seconds" in e]
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

    @staticmethod
    def _same_target(entry: dict, target_wh: float) -> bool:
        return abs(float(entry.get("target_wh", 0)) - target_wh) < 1e-9

    def best(self, target_wh: float) -> dict | None:
        """Schnellste Zeit für genau dieses Ziel (andere Ziele sind nicht vergleichbar)."""
        with self._lock:
            candidates = [e for e in self._entries if self._same_target(e, target_wh)]
            return dict(min(candidates, key=lambda e: e["seconds"])) if candidates else None

    def add(self, result: dict) -> bool:
        """Speichert ein Ergebnis und liefert True, wenn es ein neuer Rekord ist."""
        entry = dict(result)
        entry.setdefault("date", datetime.now().astimezone().isoformat(timespec="seconds"))
        with self._lock:
            previous = [e for e in self._entries if self._same_target(e, entry["target_wh"])]
            is_record = not previous or entry["seconds"] < min(e["seconds"] for e in previous)
            self._entries.append(entry)
            del self._entries[:-MAX_ENTRIES]
            self._save()
        return is_record
