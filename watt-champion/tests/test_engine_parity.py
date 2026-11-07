"""Die Demo-Engine (JS) muss sich exakt wie die Rennlogik des Servers (Python) verhalten.

Dieselben Szenarien laufen durch beide Implementierungen; verglichen werden Schnappschüsse
und Kurvenverlauf. Übersprungen, wenn Node.js fehlt.
"""
import json
import math
import os
import shutil
import subprocess
import unittest

from wattchamp.race import BusyError, Race
from wattchamp.results import ResultsStore

NODE = shutil.which("node")
REPLAY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "engine_replay.js")
PLAYERS = [{"id": "anna", "name": "Anna", "color": "red"}, {"id": "ben", "name": "Ben", "color": "cyan"}]
CAMEL = {"time_goal_s": "timeGoalS", "countdown_s": "countdownS", "tie_threshold": "tieThreshold",
         "time_reference_w": "timeReferenceW", "max_step_s": "maxStepS"}


class FakeClock:
    def __init__(self):
        self.t = 100.0

    def __call__(self):
        return self.t


def run_python(scenario):
    clock = FakeClock()
    race = Race(scenario["players"], clock=clock, results=ResultsStore(None), **scenario["options"])
    out = []
    for op in scenario["ops"]:
        kind = op["op"]
        if kind == "start":
            out.append({"op": "start", "ok": race.start()})
        elif kind == "reset":
            race.reset()
        elif kind == "configure":
            try:
                race.configure(**op["args"])
                error = None
            except BusyError:
                error = "busy"
            except ValueError:
                error = "invalid"
            out.append({"op": "configure", "error": error})
        elif kind == "run":
            for _ in range(round(op["seconds"] / op["step"])):
                clock.t += op["step"]
                race.update(op["powers"])
        elif kind == "snapshot":
            snap = race.snapshot()
            if snap["record"]:
                snap["record"].pop("date", None)
            out.append({"op": "snapshot", "snapshot": snap, "history": race.history(0, None)})
    return out


def run_js(scenario):
    js = dict(scenario)
    js["options"] = {CAMEL.get(k, k): v for k, v in scenario["options"].items()}
    proc = subprocess.run([NODE, REPLAY], input=json.dumps(js), capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise AssertionError(f"Node-Fehler:\n{proc.stderr}")
    return json.loads(proc.stdout)


def diff(a, b, path="$"):
    """Liefert die Liste der Unterschiede zwischen zwei JSON-Werten (Zahlen mit Toleranz)."""
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None or isinstance(a, str):
        return [] if a == b else [f"{path}: {a!r} != {b!r}"]
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return [] if math.isclose(a, b, abs_tol=1e-6) else [f"{path}: {a} != {b}"]
    if isinstance(a, dict) and isinstance(b, dict):
        out = [f"{path}: Schlüssel {sorted(a)} != {sorted(b)}"] if a.keys() != b.keys() else []
        for k in a.keys() & b.keys():
            out += diff(a[k], b[k], f"{path}.{k}")
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: Länge {len(a)} != {len(b)}"]
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in diff(x, y, f"{path}[{i}]")]
    return [f"{path}: Typ {type(a).__name__} != {type(b).__name__}"]


def snap():
    return {"op": "snapshot"}


def run_op(seconds, powers, step=0.25):
    return {"op": "run", "seconds": seconds, "step": step, "powers": powers}


SCENARIOS = {
    "energy-duell-mit-countdown": {
        "options": {"goal": 0.1, "countdown_s": 2},
        "ops": [snap(), {"op": "start"}, snap(), run_op(2.5, {"anna": 41.3, "ben": 20.7}), snap(),
                run_op(3, {"anna": 38.1, "ben": 27.9}), snap(), run_op(10, {"anna": 40.2, "ben": 22.3}),
                snap(), {"op": "start"}, snap()],
    },
    "energy-gleichauf-und-fuehrung": {
        "options": {"goal": 1.0, "countdown_s": 0, "tie_threshold": 0.1},
        "ops": [{"op": "start"}, run_op(20, {"anna": 28.3, "ben": 19.1}), snap(),
                run_op(20, {"anna": 60.7, "ben": 20.3}), snap(), run_op(20, {"anna": 20.3, "ben": 61.3}), snap()],
    },
    "zeit-duell": {
        "options": {"mode": "time", "time_goal_s": 8, "countdown_s": 0},
        "ops": [{"op": "start"}, run_op(3, {"anna": 33.3, "ben": 41.7}), snap(),
                run_op(6, {"anna": 51.1, "ben": 12.9}), snap()],
    },
    "zeit-gleichstand": {
        "options": {"mode": "time", "time_goal_s": 5, "countdown_s": 0},
        "ops": [{"op": "start"}, run_op(6, {"anna": 50.0, "ben": 50.0}), snap()],
    },
    "solo-energie-mit-rekord-und-geist": {
        "options": {"goal": 0.1, "solo": True, "countdown_s": 1},
        "ops": [snap(), {"op": "start"}, run_op(1.5, {"anna": 20.1, "ben": 99.9}),
                run_op(20, {"anna": 20.1, "ben": 99.9}), snap(),
                {"op": "start"}, snap(), run_op(4.5, {"anna": 15.3, "ben": 50.0}), snap(),
                run_op(20, {"anna": 180.7, "ben": 50.0}), snap(),
                {"op": "reset"}, snap()],
    },
    "solo-zeit-mit-rekord-als-bezug": {
        "options": {"mode": "time", "time_goal_s": 6, "solo": True, "countdown_s": 0},
        "ops": [snap(), {"op": "start"}, run_op(7, {"anna": 36.4, "ben": 1.0}), snap(),
                {"op": "reset"}, snap(), {"op": "start"}, run_op(3, {"anna": 70.2, "ben": 1.0}), snap(),
                run_op(4, {"anna": 70.2, "ben": 1.0}), snap()],
    },
    "einstellungen": {
        "options": {"goal": 2.0, "time_goal_s": 90, "countdown_s": 0},
        "ops": [{"op": "configure", "args": {"mode": "time"}}, snap(),
                {"op": "configure", "args": {"goal": 120, "count": 1, "names": {"anna": " Zoë  Müller "}}}, snap(),
                {"op": "configure", "args": {"mode": "energy"}}, snap(),
                {"op": "configure", "args": {"goal": 0.05}}, {"op": "configure", "args": {"count": 3}},
                {"op": "configure", "args": {"names": {"zoe": "x"}}},
                {"op": "configure", "args": {"goal": 5, "names": {"anna": ""}}}, snap(),
                {"op": "start"}, {"op": "configure", "args": {"goal": 5}}, snap()],
    },
    "ausfall-und-verlust-der-messung": {
        "options": {"goal": 5.0, "countdown_s": 0},
        "ops": [{"op": "start"}, run_op(3, {"anna": 30.0, "ben": None}), snap(),
                run_op(2, {"anna": None, "ben": 25.5}), snap()],
    },
}


@unittest.skipUnless(NODE, "Node.js nicht installiert")
class ParityTests(unittest.TestCase):
    def test_scenarios_match(self):
        for name, scenario in SCENARIOS.items():
            with self.subTest(name):
                scenario = {"players": PLAYERS, **scenario}
                py, js = run_python(scenario), run_js(scenario)
                self.assertEqual(len(py), len(js))
                problems = diff(py, js)
                self.assertEqual(problems, [], "\n".join(problems[:15]))

    def test_scenarios_exercise_what_they_claim(self):
        """Schutz gegen Scheinsicherheit: die Szenarien erreichen die interessanten Zustände wirklich."""
        seen = set()
        for scenario in SCENARIOS.values():
            for entry in run_python({"players": PLAYERS, **scenario}):
                if entry["op"] == "snapshot":
                    s = entry["snapshot"]
                    seen.add(("state", s["state"]))
                    seen.add(("mode", s["mode"], s["count"]))
                    seen.add(("ref", s["ref_kind"]))
                    seen.update(("status", p["status"]) for p in s["players"])
                    seen.add(("ghost", s["ghost"] is not None))
                    seen.add(("new_record", s["new_record"]))
        for expected in [("state", "idle"), ("state", "countdown"), ("state", "running"), ("state", "finished"),
                         ("mode", "energy", 2), ("mode", "time", 2), ("mode", "energy", 1), ("mode", "time", 1),
                         ("ref", "goal"), ("ref", "record"), ("ref", "default"),
                         ("status", "tie"), ("status", "lead"), ("status", "trail"), ("status", "winner"),
                         ("status", "loser"), ("status", "draw"), ("status", "done"), ("status", "solo"),
                         ("ghost", True), ("new_record", True)]:
            self.assertIn(expected, seen)


if __name__ == "__main__":
    unittest.main()
