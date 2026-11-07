"""Rennlogik: integriert die Leistung der Spieler zu Energie und ermittelt das Ergebnis.

Spielmodi
---------
* ``energy`` – Wer zuerst die Zielenergie (``goal`` in Wh) erzeugt hat, gewinnt.
* ``time``   – Nach ``goal`` Sekunden endet das Rennen, wer die meiste Energie erzeugt hat, gewinnt.

Beide gibt es als Duell (1 vs 1) und als Solo-Lauf (nur der erste Platz ist aktiv; gespielt wird
dann gegen die Uhr bzw. gegen den Rekord als „Geist“).

Der Zielzeitpunkt im Energie-Rennen wird zwischen zwei Messungen linear interpoliert, damit die
Rennzeit nicht von der Abtastrate abhängt.
"""
from __future__ import annotations

import math
import re
import threading
import time

IDLE, COUNTDOWN, RUNNING, FINISHED = "idle", "countdown", "running", "finished"
MODES = ("energy", "time")
# erlaubte Ziele je Modus: Energie in Wh, Zeit in Sekunden
LIMITS = {"energy": (0.1, 1000.0), "time": (5.0, 3600.0)}
UNITS = {"energy": "Wh", "time": "s"}
NAME_MAX = 16
MAX_HISTORY = 7200  # Kurvenpunkte pro Rennen (bei 1 Hz zwei Stunden)


class BusyError(RuntimeError):
    """Während eines Rennens lassen sich die Einstellungen nicht ändern."""


class _Player:
    def __init__(self, cfg: dict):
        self.id = cfg["id"]
        self.name = cfg["name"]
        self.color = cfg.get("color", "red")
        self.power_w: float | None = None
        self.energy_wh = 0.0
        self.peak_w = 0.0


class Race:
    def __init__(self, players, mode="energy", goal=1.0, time_goal_s=60.0, solo=False,
                 countdown_s=3.0, tie_threshold=0.10, time_reference_w=30.0, results=None,
                 clock=time.monotonic, max_step_s=1.0, history_interval_s=1.0):
        if len(players) < 2:
            raise ValueError("Ein Rennen braucht mindestens zwei Spieler-Plätze")
        if mode not in MODES:
            raise ValueError(f"Unbekannter Modus: {mode}")
        if goal <= 0 or time_goal_s <= 0:
            raise ValueError("Ziele müssen größer als 0 sein")
        self.players = [_Player(p) for p in players]
        self.mode = mode
        self._goals = {"energy": float(goal), "time": float(time_goal_s)}
        self.count = 1 if solo else len(self.players)
        self.countdown_s = float(countdown_s)
        self.tie_threshold = float(tie_threshold)  # Anteil der Bezugsenergie, z. B. 0.10 = 10 %
        self.time_reference_w = float(time_reference_w)
        self._results = results
        self._clock = clock
        self._max_step = max_step_s
        self._hist_interval = history_interval_s
        self._lock = threading.RLock()
        self._race_id = 0
        self._record: dict | None = None
        self._reset_race()
        self._refresh_setup()

    # ------------------------------------------------------------------ Einstellungen
    @property
    def goal(self) -> float:
        return self._goals[self.mode]

    @property
    def _active(self) -> list[_Player]:
        return self.players[:self.count]

    @staticmethod
    def _check_goal(mode: str, goal) -> float:
        if isinstance(goal, bool) or not isinstance(goal, (int, float)) or not math.isfinite(goal):
            raise ValueError("Das Ziel muss eine Zahl sein")
        lo, hi = LIMITS[mode]
        if not lo <= goal <= hi:
            raise ValueError(f"Das Ziel muss zwischen {lo:g} und {hi:g} {UNITS[mode]} liegen")
        return round(float(goal), 3) if mode == "energy" else float(round(goal))

    def _check_names(self, names) -> dict:
        if not isinstance(names, dict):
            raise ValueError("names muss ein Objekt {id: Name} sein")
        known = {p.id for p in self.players}
        out = {}
        for pid, name in names.items():
            if pid not in known:
                raise ValueError(f"Unbekannter Spieler: {pid}")
            if not isinstance(name, str):
                raise ValueError("Namen müssen Text sein")
            name = re.sub(r"\s+", " ", name).strip()
            if not 1 <= len(name) <= NAME_MAX or any(ord(c) < 32 for c in name):
                raise ValueError(f"Ein Name braucht 1 bis {NAME_MAX} Zeichen")
            out[pid] = name
        return out

    def configure(self, mode=None, goal=None, count=None, names=None) -> None:
        """Modus, Ziel, Spielerzahl und Namen ändern (nur zwischen den Rennen)."""
        with self._lock:
            if self.state in (COUNTDOWN, RUNNING):
                raise BusyError("Während eines Rennens lässt sich nichts ändern")
            new_mode = self.mode if mode is None else mode
            if new_mode not in MODES:
                raise ValueError(f"Unbekannter Modus: {mode}")
            new_goal = None if goal is None else self._check_goal(new_mode, goal)
            if count is not None and (isinstance(count, bool) or count not in (1, len(self.players))):
                raise ValueError(f"Die Spielerzahl muss 1 oder {len(self.players)} sein")
            new_names = None if names is None else self._check_names(names)

            # alles geprüft – jetzt übernehmen
            self.mode = new_mode
            if new_goal is not None:
                self._goals[new_mode] = new_goal
            if count is not None:
                self.count = count
            for p in self.players:
                if new_names and p.id in new_names:
                    p.name = new_names[p.id]
            if self.state == FINISHED:
                self._reset_race()
            self._refresh_setup()

    def _refresh_setup(self) -> None:
        """Rekord und Bezugsenergie passend zur aktuellen Einstellung bestimmen."""
        self._record = self._results.best(self.mode, self.goal) if self._results else None
        if self.mode == "energy":
            self._ref_wh, self._ref_kind = self.goal, "goal"
        elif self._record:
            self._ref_wh, self._ref_kind = max(self._record["score"], 1.0) / 1000.0, "record"
        else:
            self._ref_wh = self.time_reference_w * self.goal / 3600.0
            self._ref_kind = "default"

    # ------------------------------------------------------------------ Steuerung
    def _reset_race(self) -> None:
        self.state = IDLE
        self._race_id += 1
        self._go_at = 0.0
        self._t0 = 0.0
        self._last_t = 0.0
        self._final_elapsed = 0.0
        self._winner: str | None = None
        self._new_record = False
        self._ghost_t: float | None = None
        self._history: list[list] = []
        for p in self.players:
            p.energy_wh = 0.0
            p.peak_w = 0.0

    def start(self) -> bool:
        """Startet ein Rennen (mit Countdown). False, wenn schon eines läuft."""
        with self._lock:
            if self.state in (COUNTDOWN, RUNNING):
                return False
            self._reset_race()
            self._refresh_setup()
            if self._record and self.count == 1:
                # Solo gegen den Rekord: der „Geist“ fährt gleichmäßig auf den Rekord zu
                self._ghost_t = self._record["score"] if self.mode == "energy" else self.goal
            now = self._clock()
            if self.countdown_s > 0:
                self.state = COUNTDOWN
                self._go_at = now + self.countdown_s
            else:
                self._begin(now)
            return True

    def reset(self) -> None:
        """Bricht ein laufendes Rennen ab bzw. räumt das Ergebnis weg (zurück zur Einstellung)."""
        with self._lock:
            self._reset_race()
            self._refresh_setup()

    def _begin(self, t0: float) -> None:
        self.state = RUNNING
        self._t0 = t0
        self._last_t = t0
        self._sample_history(0.0)

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
            return self._step(now)

    def _step(self, now: float) -> dict | None:
        active = self._active
        t_end = self._t0 + self.goal
        horizon = min(now, t_end) if self.mode == "time" else now
        step_start = self._last_t
        dt = max(0.0, min(horizon - step_start, self._max_step))
        for p in active:
            if p.power_w is not None:
                p.peak_w = max(p.peak_w, p.power_w)

        if self.mode == "energy":
            # Zeitpunkt, zu dem jeder Spieler das Ziel in diesem Schritt erreichen würde
            crossings = []
            for idx, p in enumerate(active):
                rate = (p.power_w or 0.0) / 3600.0  # Wh pro Sekunde
                if rate > 0 and p.energy_wh + rate * dt >= self.goal:
                    crossings.append((step_start + (self.goal - p.energy_wh) / rate, idx))
            if crossings:
                t_win, win_idx = min(crossings)
                span = max(0.0, t_win - step_start)
                for p in active:
                    p.energy_wh += (p.power_w or 0.0) / 3600.0 * span
                winner = active[win_idx]
                winner.energy_wh = self.goal
                self._final_elapsed = t_win - self._t0
                return self._finish(winner, winner.id)

        for p in active:
            p.energy_wh += (p.power_w or 0.0) / 3600.0 * dt
        self._last_t = horizon
        self._sample_history(horizon - self._t0)
        if self.mode == "time" and now >= t_end:
            self._final_elapsed = self.goal
            ranked = sorted(active, key=lambda p: -p.energy_wh)
            draw = len(active) > 1 and abs(ranked[0].energy_wh - ranked[1].energy_wh) < 1e-4
            return self._finish(ranked[0], None if draw or len(active) == 1 else ranked[0].id)
        return None

    def _finish(self, top: _Player, winner_id: str | None) -> dict:
        self.state = FINISHED
        self._winner = winner_id
        self._sample_history(self._final_elapsed, force=True)
        seconds = round(self._final_elapsed, 2)
        result = {
            "mode": self.mode,
            "goal": self.goal,
            "player": top.id,
            "name": top.name,
            "seconds": seconds,
            "score": seconds if self.mode == "energy" else round(top.energy_wh * 1000, 1),
            "count": self.count,
            "energy_mwh": {p.id: round(p.energy_wh * 1000, 1) for p in self._active},
        }
        if self._results is not None:
            self._new_record = self._results.add(result)
            self._record = self._results.best(self.mode, self.goal)
        return result

    def _sample_history(self, elapsed: float, force: bool = False) -> None:
        if len(self._history) >= MAX_HISTORY:
            return
        if not force and self._history and elapsed - self._history[-1][0] < self._hist_interval - 1e-9:
            return
        self._history.append([round(elapsed, 2)] + [
            None if p.power_w is None else round(p.power_w, 2) for p in self._active])

    def history(self, since: int = 0, race_id: int | None = None) -> dict:
        """Leistungskurve (ein Punkt je Sekunde): ``[t, w_spieler1, w_spieler2]``.

        Kennt der Aufrufer ein anderes Rennen (``race_id``), bekommt er alles von vorn.
        """
        with self._lock:
            if race_id != self._race_id or since < 0 or since > len(self._history):
                since = 0
            return {"race_id": self._race_id, "from": since, "points": self._history[since:]}

    # ------------------------------------------------------------------ Anzeige
    def _statuses(self, energies: list[float]) -> list[str]:
        n = len(energies)
        if self.state == FINISHED:
            if n == 1:
                return ["done"]
            if self._winner is None:
                return ["draw"] * n
            return ["winner" if p.id == self._winner else "loser" for p in self._active]
        if self.state != RUNNING:
            return ["ready"] * n
        if n == 1:
            return ["solo"]
        leader = max(energies)
        # Abstand zum Führenden als Anteil der Bezugsenergie; "dicht dran" = Gleichauf
        gaps = [(leader - e) / self._ref_wh for e in energies]

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
                if self.mode == "time":
                    elapsed = min(elapsed, self.goal)
            elif self.state == FINISHED:
                elapsed = self._final_elapsed
            else:
                elapsed = 0.0
            remaining = None
            if self.mode == "time":
                remaining = 0.0 if self.state == FINISHED else max(0.0, self.goal - elapsed)

            active = self._active
            energies = [p.energy_wh for p in active]
            order = sorted(range(len(energies)), key=lambda i: (-energies[i], i))
            rank = {idx: pos + 1 for pos, idx in enumerate(order)}
            statuses = self._statuses(energies)
            players = []
            for idx, p in enumerate(active):
                ratio = p.energy_wh / self._ref_wh
                players.append({
                    "id": p.id,
                    "name": p.name,
                    "color": p.color,
                    "power_w": None if p.power_w is None else round(p.power_w, 2),
                    "energy_mwh": round(p.energy_wh * 1000, 1),
                    "progress": min(1.0, ratio),
                    "ratio": ratio,
                    "rank": rank[idx],
                    "status": statuses[idx],
                    "peak_w": round(p.peak_w, 2),
                    "avg_w": round(p.energy_wh * 3600 / elapsed, 2) if elapsed >= 1 else None,
                })

            ghost = None
            if self._ghost_t and self.state != IDLE:
                ghost = {"name": "Rekord", "progress": min(1.0, elapsed / self._ghost_t)}

            return {
                "race_id": self._race_id,
                "state": self.state,
                "mode": self.mode,
                "goal": self.goal,
                "goals": dict(self._goals),
                "limits": {m: list(v) for m, v in LIMITS.items()},
                "count": self.count,
                "countdown": countdown,
                "elapsed": round(elapsed, 2),
                "remaining": None if remaining is None else round(remaining, 2),
                "ref_wh": round(self._ref_wh, 4),
                "ref_kind": self._ref_kind,
                "has_data": any(p.power_w is not None for p in self.players),
                "players": players,
                "slots": [{"id": p.id, "name": p.name, "color": p.color, "active": i < self.count,
                           "power_w": None if p.power_w is None else round(p.power_w, 2)}
                          for i, p in enumerate(self.players)],
                "ghost": ghost,
                "winner": self._winner,
                "record": dict(self._record) if self._record else None,
                "new_record": self._new_record,
                "history_len": len(self._history),
            }
