"""Rennlogik: integriert die Leistung der Spieler zu Energie und ermittelt den Sieger.

Wer zuerst die Zielenergie (``target_wh``) erzeugt hat, gewinnt. Der Zielzeitpunkt wird
zwischen zwei Messungen linear interpoliert, damit die Rennzeit nicht von der
Abtastrate abhängt.
"""
from __future__ import annotations

import math
import threading
import time

IDLE, COUNTDOWN, RUNNING, FINISHED = "idle", "countdown", "running", "finished"


class _Player:
    def __init__(self, cfg: dict):
        self.id = cfg["id"]
        self.name = cfg["name"]
        self.color = cfg.get("color", "red")
        self.power_w: float | None = None
        self.energy_wh = 0.0


class Race:
    def __init__(self, players, target_wh=1.0, countdown_s=3.0, tie_threshold=0.10,
                 results=None, clock=time.monotonic, max_step_s=1.0):
        if target_wh <= 0:
            raise ValueError("target_wh muss größer als 0 sein")
        if len(players) < 2:
            raise ValueError("Ein Rennen braucht mindestens zwei Spieler")
        self.players = [_Player(p) for p in players]
        self.target_wh = float(target_wh)
        self.countdown_s = float(countdown_s)
        self.tie_threshold = float(tie_threshold)  # Anteil des Ziels, z. B. 0.10 = 10 %
        self._results = results
        self._clock = clock
        self._max_step = max_step_s
        self._lock = threading.RLock()
        self._reset_race()

    # ------------------------------------------------------------------ Steuerung
    def _reset_race(self) -> None:
        self.state = IDLE
        self._go_at = 0.0
        self._t0 = 0.0
        self._last_t = 0.0
        self._final_elapsed = 0.0
        self._winner: str | None = None
        self._new_record = False
        for p in self.players:
            p.energy_wh = 0.0

    def start(self) -> bool:
        """Startet ein Rennen (mit Countdown). False, wenn schon eines läuft."""
        with self._lock:
            if self.state in (COUNTDOWN, RUNNING):
                return False
            self._reset_race()
            now = self._clock()
            if self.countdown_s > 0:
                self.state = COUNTDOWN
                self._go_at = now + self.countdown_s
            else:
                self._begin(now)
            return True

    def reset(self) -> None:
        """Bricht ein laufendes Rennen ab bzw. räumt das Ergebnis weg."""
        with self._lock:
            self._reset_race()

    def _begin(self, t0: float) -> None:
        self.state = RUNNING
        self._t0 = t0
        self._last_t = t0

    # ------------------------------------------------------------------ Messwerte
    def update(self, powers: dict) -> dict | None:
        """Neue Leistungswerte in Watt (``None`` = kein Messwert) verarbeiten.

        Gibt das Ergebnis zurück, wenn das Rennen mit diesem Aufruf endet.
        """
        with self._lock:
            now = self._clock()
            for p in self.players:
                watts = powers.get(p.id)
                p.power_w = None if watts is None else max(0.0, float(watts))

            if self.state == COUNTDOWN and now >= self._go_at:
                self._begin(self._go_at)
            if self.state != RUNNING:
                return None

            dt = max(0.0, min(now - self._last_t, self._max_step))
            step_start = self._last_t
            # Zeitpunkt, zu dem jeder Spieler das Ziel in diesem Schritt erreichen würde
            crossings = []
            for idx, p in enumerate(self.players):
                rate = (p.power_w or 0.0) / 3600.0  # Wh pro Sekunde
                if rate > 0 and p.energy_wh + rate * dt >= self.target_wh:
                    crossings.append((step_start + (self.target_wh - p.energy_wh) / rate, idx))

            if not crossings:
                for p in self.players:
                    p.energy_wh += (p.power_w or 0.0) / 3600.0 * dt
                self._last_t = now
                return None

            t_win, win_idx = min(crossings)
            span = max(0.0, t_win - step_start)
            for p in self.players:
                p.energy_wh += (p.power_w or 0.0) / 3600.0 * span
            winner = self.players[win_idx]
            winner.energy_wh = self.target_wh
            return self._finish(winner, t_win - self._t0)

    def _finish(self, winner: _Player, elapsed: float) -> dict:
        self.state = FINISHED
        self._winner = winner.id
        self._final_elapsed = elapsed
        result = {
            "player": winner.id,
            "name": winner.name,
            "seconds": round(elapsed, 2),
            "target_wh": self.target_wh,
            "energy_mwh": {p.id: round(p.energy_wh * 1000, 1) for p in self.players},
        }
        if self._results is not None:
            self._new_record = self._results.add(result)
        return result

    # ------------------------------------------------------------------ Anzeige
    def _statuses(self, energies: list[float]) -> list[str]:
        if self.state == FINISHED:
            return ["winner" if p.id == self._winner else "loser" for p in self.players]
        if self.state != RUNNING:
            return ["ready"] * len(self.players)
        leader = max(energies)
        # Abstand zum Führenden als Anteil des Ziels; "dicht dran" = Gleichauf
        gaps = [(leader - e) / self.target_wh for e in energies]

        def close(gap: float) -> bool:
            return gap == 0 or gap < self.tie_threshold

        statuses = []
        for idx, gap in enumerate(gaps):
            if gap == 0:  # Führender (oder exakt gleichauf)
                rival_close = any(close(g) for j, g in enumerate(gaps) if j != idx)
                statuses.append("tie" if rival_close else "lead")
            else:
                statuses.append("tie" if close(gap) else "trail")
        return statuses

    def snapshot(self) -> dict:
        """Aktueller Zustand für die Oberfläche (JSON-serialisierbar)."""
        with self._lock:
            now = self._clock()
            countdown = None
            if self.state == COUNTDOWN:
                countdown = max(1, math.ceil(self._go_at - now))
                elapsed = 0.0
            elif self.state == RUNNING:
                elapsed = max(0.0, now - self._t0)
            elif self.state == FINISHED:
                elapsed = self._final_elapsed
            else:
                elapsed = 0.0

            energies = [p.energy_wh for p in self.players]
            order = sorted(range(len(energies)), key=lambda i: (-energies[i], i))
            rank = {idx: pos + 1 for pos, idx in enumerate(order)}
            statuses = self._statuses(energies)
            players = []
            for idx, p in enumerate(self.players):
                players.append({
                    "id": p.id,
                    "name": p.name,
                    "color": p.color,
                    "power_w": None if p.power_w is None else round(p.power_w, 2),
                    "energy_mwh": round(p.energy_wh * 1000, 1),
                    "progress": min(1.0, p.energy_wh / self.target_wh),
                    "rank": rank[idx],
                    "status": statuses[idx],
                })
            best = self._results.best(self.target_wh) if self._results else None
            return {
                "state": self.state,
                "countdown": countdown,
                "elapsed": round(elapsed, 2),
                "target_wh": self.target_wh,
                "has_data": any(p.power_w is not None for p in self.players),
                "players": players,
                "winner": self._winner,
                "record": best,
                "new_record": self._new_record,
            }
