"""Verdrahtet Konfiguration, Sensor, Rennlogik und den Abtast-Thread."""
from __future__ import annotations

import logging
import threading
import time

from .race import Race
from .results import ResultsStore
from .sensors import make_sensor

log = logging.getLogger(__name__)


class App:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.results = ResultsStore(cfg["results_file"])
        self.race = Race(
            cfg["players"],
            target_wh=cfg["target_wh"],
            countdown_s=cfg["countdown_s"],
            tie_threshold=cfg["tie_threshold_pct"] / 100.0,
            results=self.results,
        )
        self.sensor = make_sensor(cfg)
        self._period = 1.0 / cfg["sample_hz"]
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="sampler", daemon=True)

    def public_config(self) -> dict:
        """Teil der Konfiguration, den die Oberfläche braucht."""
        return {
            "title": self.cfg["title"],
            "sponsor_logo": self.cfg["sponsor_logo"],
            "sensor": self.cfg["sensor"]["type"],
        }

    def state(self) -> dict:
        snap = self.race.snapshot()
        snap["config"] = self.public_config()
        return snap

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=2)
        self.sensor.close()

    def _run(self) -> None:
        next_tick = time.monotonic()
        while not self._stop.is_set():
            try:
                powers = self.sensor.read()
            except Exception:  # noqa: BLE001 - ein Lesefehler darf das Rennen nicht beenden
                log.exception("Sensor-Lesefehler")
                powers = {}
            result = self.race.update(powers)
            if result:
                log.info("Rennen beendet: %s in %.1f s", result["name"], result["seconds"])
            next_tick += self._period
            delay = next_tick - time.monotonic()
            if delay < 0:  # hinterher – nicht aufholen, sondern neu aufsetzen
                next_tick = time.monotonic()
                delay = 0
            self._stop.wait(delay)
