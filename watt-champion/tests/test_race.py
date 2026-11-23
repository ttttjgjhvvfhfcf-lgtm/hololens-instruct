import os
import tempfile
import unittest

from wattchamp.race import COUNTDOWN, FINISHED, IDLE, RUNNING, BusyError, Race
from wattchamp.results import ResultsStore

PLAYERS = [
    {"id": "anna", "name": "Anna", "color": "red"},
    {"id": "ben", "name": "Ben", "color": "cyan"},
]


class FakeClock:
    def __init__(self):
        self.t = 100.0

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += seconds


def make_race(**kw):
    clock = FakeClock()
    kw.setdefault("countdown_s", 0)
    return Race(PLAYERS, clock=clock, **kw), clock


def run(race, clock, powers, seconds, step=0.1):
    """Lässt die Zeit in kleinen Schritten laufen und gibt das Endergebnis zurück."""
    result = None
    for _ in range(round(seconds / step)):
        clock.advance(step)
        result = race.update(powers) or result
    return result


class EnergyTests(unittest.TestCase):
    def test_integrates_power_to_energy(self):
        race, clock = make_race(goal=10)
        race.start()
        run(race, clock, {"anna": 36.0, "ben": 18.0}, 10)  # 36 W * 10 s = 0.1 Wh
        snap = race.snapshot()
        anna, ben = snap["players"]
        self.assertAlmostEqual(anna["energy_mwh"], 100.0, delta=0.5)
        self.assertAlmostEqual(ben["energy_mwh"], 50.0, delta=0.5)
        self.assertAlmostEqual(anna["progress"], 0.01, places=3)
        self.assertEqual(snap["state"], RUNNING)

    def test_no_energy_before_start(self):
        race, clock = make_race()
        run(race, clock, {"anna": 50, "ben": 50}, 5)
        snap = race.snapshot()
        self.assertEqual(snap["state"], IDLE)
        self.assertEqual([p["energy_mwh"] for p in snap["players"]], [0.0, 0.0])
        self.assertEqual([p["power_w"] for p in snap["players"]], [50, 50])  # Live-Leistung trotzdem

    def test_missing_and_negative_values_count_as_zero(self):
        race, clock = make_race(goal=10)
        race.start()
        run(race, clock, {"anna": None, "ben": -5.0}, 5)
        snap = race.snapshot()
        self.assertEqual([p["energy_mwh"] for p in snap["players"]], [0.0, 0.0])
        self.assertIsNone(snap["players"][0]["power_w"])
        self.assertEqual(snap["players"][1]["power_w"], 0.0)

    def test_has_data(self):
        race, clock = make_race()
        self.assertFalse(race.snapshot()["has_data"])
        race.update({"anna": None, "ben": 3.0})
        self.assertTrue(race.snapshot()["has_data"])

    def test_long_stall_is_capped(self):
        race, clock = make_race(goal=10, max_step_s=1.0)
        race.start()
        clock.advance(60)  # Sampler hing eine Minute
        race.update({"anna": 3600.0, "ben": 0})  # 1 Wh/s
        self.assertAlmostEqual(race.snapshot()["players"][0]["energy_mwh"], 1000.0, delta=1)


class FinishTests(unittest.TestCase):
    def test_winner_and_interpolated_time(self):
        race, clock = make_race(goal=1.0)
        race.start()
        # 36 W -> 0.01 Wh/s -> exakt 100 s; ben mit 18 W kommt auf 0,5 Wh
        result = run(race, clock, {"anna": 36.0, "ben": 18.0}, 110, step=0.3)
        snap = race.snapshot()
        self.assertEqual(snap["state"], FINISHED)
        self.assertEqual(snap["winner"], "anna")
        self.assertAlmostEqual(result["seconds"], 100.0, places=1)
        self.assertAlmostEqual(snap["elapsed"], 100.0, places=1)
        anna, ben = snap["players"]
        self.assertEqual(anna["energy_mwh"], 1000.0)
        self.assertEqual(anna["progress"], 1.0)
        self.assertAlmostEqual(ben["energy_mwh"], 500.0, delta=1)
        self.assertEqual((anna["status"], ben["status"]), ("winner", "loser"))
        self.assertEqual((anna["rank"], ben["rank"]), (1, 2))

    def test_time_independent_of_sample_rate(self):
        times = []
        for step in (0.05, 0.25, 0.9):
            race, clock = make_race(goal=1.0)
            race.start()
            times.append(run(race, clock, {"anna": 36.0, "ben": 10.0}, 105, step=step)["seconds"])
        for t in times:
            self.assertAlmostEqual(t, 100.0, delta=0.05)

    def test_frozen_after_finish(self):
        race, clock = make_race(goal=0.1)
        race.start()
        run(race, clock, {"anna": 60.0, "ben": 30.0}, 8)
        before = race.snapshot()
        run(race, clock, {"anna": 60.0, "ben": 60.0}, 30)
        after = race.snapshot()
        self.assertEqual(before["elapsed"], after["elapsed"])
        self.assertEqual([p["energy_mwh"] for p in before["players"]],
                         [p["energy_mwh"] for p in after["players"]])

    def test_earliest_crossing_wins_within_one_step(self):
        race, clock = make_race(goal=1.0, max_step_s=1000)
        race.start()
        # Ein einziger großer Schritt: ben ist schneller und kreuzt früher
        clock.advance(100)
        result = race.update({"anna": 40.0, "ben": 90.0})
        self.assertEqual(result["player"], "ben")
        self.assertAlmostEqual(result["seconds"], 40.0, places=2)  # 1 Wh / 90 W = 40 s
        anna = race.snapshot()["players"][0]
        self.assertAlmostEqual(anna["energy_mwh"], 40.0 * 40 / 3.6, delta=0.5)

    def test_start_again_after_finish(self):
        race, clock = make_race(goal=0.1)
        race.start()
        run(race, clock, {"anna": 60.0, "ben": 30.0}, 8)
        self.assertEqual(race.snapshot()["state"], FINISHED)
        self.assertTrue(race.start())
        snap = race.snapshot()
        self.assertEqual(snap["state"], RUNNING)
        self.assertIsNone(snap["winner"])
        self.assertEqual([p["energy_mwh"] for p in snap["players"]], [0.0, 0.0])


class ControlTests(unittest.TestCase):
    def test_countdown(self):
        race, clock = make_race(countdown_s=3)
        race.start()
        snap = race.snapshot()
        self.assertEqual((snap["state"], snap["countdown"]), (COUNTDOWN, 3))
        clock.advance(1.2)
        race.update({"anna": 100, "ben": 100})
        snap = race.snapshot()
        self.assertEqual((snap["state"], snap["countdown"]), (COUNTDOWN, 2))
        self.assertEqual(snap["players"][0]["energy_mwh"], 0.0)
        clock.advance(1.8)  # t = 3.0 -> Start
        race.update({"anna": 100, "ben": 100})
        self.assertEqual(race.snapshot()["state"], RUNNING)

    def test_energy_counts_from_go_not_from_countdown(self):
        race, clock = make_race(countdown_s=3, goal=10)
        race.start()
        clock.advance(4.0)  # 1 s nach dem Go
        race.update({"anna": 3600.0, "ben": 0})
        self.assertAlmostEqual(race.snapshot()["players"][0]["energy_mwh"], 1000.0, delta=1)
        self.assertAlmostEqual(race.snapshot()["elapsed"], 1.0, places=2)

    def test_cannot_start_twice(self):
        race, _ = make_race()
        self.assertTrue(race.start())
        self.assertFalse(race.start())

    def test_reset_aborts(self):
        race, clock = make_race(goal=10)
        race.start()
        run(race, clock, {"anna": 50, "ben": 50}, 3)
        race.reset()
        snap = race.snapshot()
        self.assertEqual(snap["state"], IDLE)
        self.assertEqual(snap["elapsed"], 0.0)
        self.assertEqual([p["energy_mwh"] for p in snap["players"]], [0.0, 0.0])

    def test_invalid_arguments(self):
        with self.assertRaises(ValueError):
            Race(PLAYERS, goal=0)
        with self.assertRaises(ValueError):
            Race(PLAYERS[:1])


class StatusTests(unittest.TestCase):
    def statuses(self, anna_w, ben_w, seconds=20):
        race, clock = make_race(goal=1.0, tie_threshold=0.10)
        race.start()
        run(race, clock, {"anna": anna_w, "ben": ben_w}, seconds)
        return [p["status"] for p in race.snapshot()["players"]]

    def test_ready_before_start(self):
        race, _ = make_race()
        self.assertEqual([p["status"] for p in race.snapshot()["players"]], ["ready", "ready"])

    def test_tie_at_start(self):
        race, _ = make_race()
        race.start()
        self.assertEqual([p["status"] for p in race.snapshot()["players"]], ["tie", "tie"])

    def test_tie_when_close(self):
        # 20 s: 28 W -> 156 mWh, 19 W -> 106 mWh -> Abstand 5 % < 10 %  (Beispiel aus dem Entwurf)
        self.assertEqual(self.statuses(28, 19), ["tie", "tie"])

    def test_lead_and_trail_when_far_apart(self):
        self.assertEqual(self.statuses(60, 20), ["lead", "trail"])
        self.assertEqual(self.statuses(20, 60), ["trail", "lead"])

    def test_rank_follows_energy(self):
        race, clock = make_race(goal=10)
        race.start()
        run(race, clock, {"anna": 10, "ben": 30}, 5)
        self.assertEqual([p["rank"] for p in race.snapshot()["players"]], [2, 1])

    def test_three_players(self):
        players = PLAYERS + [{"id": "cem", "name": "Cem", "color": "green"}]
        clock = FakeClock()
        race = Race(players, goal=1.0, countdown_s=0, clock=clock, tie_threshold=0.10)
        race.start()
        run(race, clock, {"anna": 60, "ben": 58, "cem": 10}, 20)
        self.assertEqual([p["status"] for p in race.snapshot()["players"]], ["tie", "tie", "trail"])


class RecordTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "data", "results.json")

    def tearDown(self):
        self.tmp.cleanup()

    def finish_race(self, store, anna_w):
        race, clock = make_race(goal=0.1, results=store)
        race.start()
        run(race, clock, {"anna": anna_w, "ben": 1.0}, 30)
        return race.snapshot()

    def test_first_result_is_record_and_persisted(self):
        store = ResultsStore(self.path)
        self.assertIsNone(store.best("energy", 0.1))
        snap = self.finish_race(store, 36.0)  # 0.1 Wh / 36 W = 10 s
        self.assertTrue(snap["new_record"])
        self.assertAlmostEqual(snap["record"]["seconds"], 10.0, places=1)
        reloaded = ResultsStore(self.path)
        self.assertAlmostEqual(reloaded.best("energy", 0.1)["seconds"], 10.0, places=1)
        self.assertEqual(reloaded.best("energy", 0.1)["name"], "Anna")

    def test_slower_race_is_not_a_record(self):
        store = ResultsStore(self.path)
        self.finish_race(store, 36.0)
        snap = self.finish_race(store, 18.0)
        self.assertFalse(snap["new_record"])
        self.assertAlmostEqual(snap["record"]["seconds"], 10.0, places=1)

    def test_faster_race_beats_record(self):
        store = ResultsStore(self.path)
        self.finish_race(store, 18.0)
        snap = self.finish_race(store, 36.0)
        self.assertTrue(snap["new_record"])

    def test_records_are_per_target(self):
        store = ResultsStore(self.path)
        self.finish_race(store, 36.0)
        self.assertIsNone(store.best("energy", 1.0))

    def test_corrupt_file_starts_empty(self):
        os.makedirs(os.path.dirname(self.path))
        with open(self.path, "w") as fh:
            fh.write("{kaputt")
        self.assertIsNone(ResultsStore(self.path).best("energy", 0.1))

    def test_unwritable_path_does_not_crash(self):
        blocker = os.path.join(self.tmp.name, "file")
        open(blocker, "w").close()
        store = ResultsStore(os.path.join(blocker, "results.json"))  # Elternteil ist eine Datei
        self.assertTrue(store.add({"seconds": 5.0, "target_wh": 1.0}))


class TimeModeTests(unittest.TestCase):
    def make(self, goal=10, **kw):
        race, clock = make_race(mode="time", time_goal_s=goal, **kw)
        return race, clock

    def test_ends_after_time_limit_and_most_energy_wins(self):
        race, clock = self.make(goal=10)
        race.start()
        result = run(race, clock, {"anna": 36.0, "ben": 72.0}, 10.5, step=0.25)
        snap = race.snapshot()
        self.assertEqual(snap["state"], FINISHED)
        self.assertEqual(snap["winner"], "ben")
        self.assertAlmostEqual(snap["elapsed"], 10.0, places=2)
        self.assertEqual(snap["remaining"], 0.0)
        anna, ben = snap["players"]
        self.assertAlmostEqual(anna["energy_mwh"], 100.0, delta=0.2)   # 36 W * 10 s
        self.assertAlmostEqual(ben["energy_mwh"], 200.0, delta=0.2)
        self.assertEqual((anna["status"], ben["status"]), ("loser", "winner"))
        self.assertEqual(result["mode"], "time")
        self.assertAlmostEqual(result["score"], 200.0, delta=0.2)    # Wertung = Energie des Siegers in mWh

    def test_energy_stops_exactly_at_the_limit(self):
        race, clock = self.make(goal=10, max_step_s=100)
        race.start()
        clock.advance(25)  # ein einziger, viel zu später Aufruf
        race.update({"anna": 3600.0, "ben": 0.0})   # 1 Wh/s
        self.assertEqual(race.snapshot()["state"], FINISHED)
        self.assertAlmostEqual(race.snapshot()["players"][0]["energy_mwh"], 10000.0, delta=1)  # nur 10 s zählen

    def test_remaining_counts_down(self):
        race, clock = self.make(goal=60)
        self.assertEqual(race.snapshot()["remaining"], 60)
        race.start()
        run(race, clock, {"anna": 1, "ben": 1}, 12.5, step=0.5)
        self.assertAlmostEqual(race.snapshot()["remaining"], 47.5, places=1)

    def test_draw(self):
        race, clock = self.make(goal=5)
        race.start()
        run(race, clock, {"anna": 50.0, "ben": 50.0}, 6, step=0.5)
        snap = race.snapshot()
        self.assertEqual(snap["state"], FINISHED)
        self.assertIsNone(snap["winner"])
        self.assertEqual([p["status"] for p in snap["players"]], ["draw", "draw"])

    def test_progress_is_relative_to_default_reference_without_record(self):
        race, clock = self.make(goal=60, time_reference_w=30)   # Richtwert: 30 W * 60 s = 0,5 Wh
        snap = race.snapshot()
        self.assertEqual(snap["ref_kind"], "default")
        self.assertAlmostEqual(snap["ref_wh"], 0.5)
        race.start()
        run(race, clock, {"anna": 60.0, "ben": 15.0}, 15, step=0.5)  # anna 0,25 Wh, ben 0,0625 Wh
        anna, ben = race.snapshot()["players"]
        self.assertAlmostEqual(anna["progress"], 0.5, places=2)
        self.assertAlmostEqual(ben["progress"], 0.125, places=2)

    def test_progress_can_exceed_reference_but_bar_is_capped(self):
        race, clock = self.make(goal=60, time_reference_w=30)
        race.start()
        run(race, clock, {"anna": 120.0, "ben": 1.0}, 20, step=0.5)  # 0,667 Wh = 133 % von 0,5 Wh
        anna = race.snapshot()["players"][0]
        self.assertGreater(anna["ratio"], 1.3)
        self.assertEqual(anna["progress"], 1.0)

    def test_record_is_most_energy_and_becomes_the_reference(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ResultsStore(os.path.join(tmp, "r.json"))
            race, clock = self.make(goal=10, results=store)
            race.start()
            run(race, clock, {"anna": 36.0, "ben": 18.0}, 11, step=0.5)   # Rekord: 100 mWh
            self.assertTrue(race.snapshot()["new_record"])
            self.assertAlmostEqual(store.best("time", 10)["score"], 100.0, delta=0.2)
            race.reset()
            snap = race.snapshot()
            self.assertEqual(snap["ref_kind"], "record")
            self.assertAlmostEqual(snap["ref_wh"], 0.1, places=3)
            race.start()
            run(race, clock, {"anna": 10.0, "ben": 10.0}, 11, step=0.5)   # schwächer -> kein Rekord
            self.assertFalse(race.snapshot()["new_record"])
            race.start()
            run(race, clock, {"anna": 72.0, "ben": 1.0}, 11, step=0.5)    # stärker -> Rekord
            self.assertTrue(race.snapshot()["new_record"])


class SoloTests(unittest.TestCase):
    def test_only_first_slot_is_active(self):
        race, clock = make_race(goal=10, solo=True)
        race.start()
        run(race, clock, {"anna": 36.0, "ben": 500.0}, 10, step=0.5)
        snap = race.snapshot()
        self.assertEqual(snap["count"], 1)
        self.assertEqual([p["id"] for p in snap["players"]], ["anna"])
        self.assertEqual(snap["players"][0]["status"], "solo")
        self.assertEqual([s["active"] for s in snap["slots"]], [True, False])
        self.assertEqual(snap["slots"][1]["power_w"], 500.0)   # der Sensor von Platz 2 wird trotzdem angezeigt

    def test_solo_energy_race_finishes_with_done(self):
        race, clock = make_race(goal=0.1, solo=True)
        race.start()
        result = run(race, clock, {"anna": 36.0, "ben": 999.0}, 20, step=0.3)
        snap = race.snapshot()
        self.assertEqual(snap["state"], FINISHED)
        self.assertEqual(result["player"], "anna")
        self.assertAlmostEqual(result["seconds"], 10.0, places=1)
        self.assertEqual(snap["players"][0]["status"], "done")
        self.assertEqual(snap["winner"], "anna")

    def test_solo_time_race_has_no_winner(self):
        race, clock = make_race(mode="time", time_goal_s=5, solo=True)
        race.start()
        run(race, clock, {"anna": 36.0, "ben": 0.0}, 6, step=0.5)
        snap = race.snapshot()
        self.assertEqual(snap["state"], FINISHED)
        self.assertIsNone(snap["winner"])
        self.assertEqual(snap["players"][0]["status"], "done")

    def test_ghost_follows_record_pace(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ResultsStore(os.path.join(tmp, "r.json"))
            store.add({"mode": "energy", "goal": 0.1, "score": 10.0, "seconds": 10.0, "name": "Zoe"})
            race, clock = make_race(goal=0.1, solo=True, results=store)
            self.assertIsNone(race.snapshot()["ghost"])             # in der Einstellung kein Geist
            race.start()
            run(race, clock, {"anna": 18.0, "ben": 0.0}, 4, step=0.5)  # Rekord 10 s -> nach 4 s 40 %
            snap = race.snapshot()
            self.assertAlmostEqual(snap["ghost"]["progress"], 0.4, places=2)
            self.assertLess(snap["players"][0]["progress"], 0.4)        # Spielerin ist langsamer
            run(race, clock, {"anna": 360.0, "ben": 0.0}, 5, step=0.1)  # überholt und gewinnt
            snap = race.snapshot()
            self.assertEqual(snap["state"], FINISHED)
            self.assertLess(snap["ghost"]["progress"], 1.0)             # Geist bleibt stehen, wo er war

    def test_no_ghost_in_duel(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ResultsStore(os.path.join(tmp, "r.json"))
            store.add({"mode": "energy", "goal": 0.1, "score": 10.0, "seconds": 10.0, "name": "Zoe"})
            race, _ = make_race(goal=0.1, results=store)
            race.start()
            self.assertIsNone(race.snapshot()["ghost"])


class ConfigureTests(unittest.TestCase):
    def test_switching_mode_remembers_goal_per_mode(self):
        race, _ = make_race(goal=2.0, time_goal_s=90)
        race.configure(mode="time")
        self.assertEqual((race.snapshot()["mode"], race.snapshot()["goal"]), ("time", 90))
        race.configure(goal=120)
        race.configure(mode="energy")
        self.assertEqual(race.snapshot()["goal"], 2.0)
        race.configure(mode="time")
        self.assertEqual(race.snapshot()["goal"], 120)
        self.assertEqual(race.snapshot()["goals"], {"energy": 2.0, "time": 120.0})

    def test_names_and_count(self):
        race, _ = make_race()
        race.configure(count=1, names={"anna": "  Zoë   Müller ", "ben": "Ben"})
        snap = race.snapshot()
        self.assertEqual(snap["count"], 1)
        self.assertEqual([s["name"] for s in snap["slots"]], ["Zoë Müller", "Ben"])
        self.assertEqual(snap["players"][0]["name"], "Zoë Müller")

    def test_validation_changes_nothing(self):
        race, _ = make_race(goal=1.0)
        bad = [
            dict(mode="sprint"), dict(goal=0.05), dict(goal=1001), dict(goal="viel"), dict(goal=True),
            dict(goal=float("nan")), dict(mode="time", goal=4), dict(mode="time", goal=3601),
            dict(count=0), dict(count=3), dict(count=True), dict(names="Anna"),
            dict(names={"zoe": "Zoe"}), dict(names={"anna": ""}), dict(names={"anna": "x" * 17}),
            dict(names={"anna": 5}), dict(names={"anna": "a\x07b"}), dict(names={"anna": " \n "}),
        ]
        for kwargs in bad:
            with self.subTest(kwargs), self.assertRaises(ValueError):
                race.configure(**kwargs)
        # auch ein halb gültiger Aufruf darf nichts übernehmen
        with self.assertRaises(ValueError):
            race.configure(goal=5.0, names={"anna": ""})
        snap = race.snapshot()
        self.assertEqual((snap["mode"], snap["goal"], snap["count"]), ("energy", 1.0, 2))
        self.assertEqual(snap["slots"][0]["name"], "Anna")

    def test_whitespace_in_names_is_collapsed(self):
        race, _ = make_race()
        race.configure(names={"anna": "  Anna \n\t Lena  "})
        self.assertEqual(race.snapshot()["slots"][0]["name"], "Anna Lena")

    def test_limits_are_accepted_at_the_edges(self):
        race, _ = make_race()
        race.configure(goal=0.1)
        race.configure(goal=1000)
        race.configure(mode="time", goal=5)
        race.configure(goal=3600)

    def test_time_goal_is_rounded_to_whole_seconds(self):
        race, _ = make_race()
        race.configure(mode="time", goal=59.6)
        self.assertEqual(race.snapshot()["goal"], 60)

    def test_busy_during_race(self):
        race, _ = make_race()
        race.start()
        with self.assertRaises(BusyError):
            race.configure(goal=2)

    def test_configure_after_finish_returns_to_setup(self):
        race, clock = make_race(goal=0.1)
        race.start()
        run(race, clock, {"anna": 60.0, "ben": 30.0}, 8)
        self.assertEqual(race.snapshot()["state"], FINISHED)
        race.configure(goal=0.2)
        snap = race.snapshot()
        self.assertEqual((snap["state"], snap["goal"]), (IDLE, 0.2))

    def test_record_in_setup_follows_mode_and_goal(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ResultsStore(os.path.join(tmp, "r.json"))
            store.add({"mode": "energy", "goal": 1.0, "score": 80.0, "seconds": 80.0, "name": "Zoe"})
            race, _ = make_race(goal=0.5, results=store)
            self.assertIsNone(race.snapshot()["record"])
            race.configure(goal=1.0)
            self.assertEqual(race.snapshot()["record"]["name"], "Zoe")
            race.configure(mode="time")
            self.assertIsNone(race.snapshot()["record"])


class HistoryAndStatsTests(unittest.TestCase):
    def test_history_one_point_per_second(self):
        race, clock = make_race(goal=1000)
        race.start()
        run(race, clock, {"anna": 30.0, "ben": 20.0}, 5.2, step=0.1)
        h = race.history()
        self.assertEqual([p[0] for p in h["points"]], [0.0, 1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertEqual(h["points"][2][1:], [30.0, 20.0])
        self.assertEqual(race.snapshot()["history_len"], 6)

    def test_history_incremental_and_race_change(self):
        race, clock = make_race(goal=1000)
        race.start()
        run(race, clock, {"anna": 1, "ben": 1}, 3.2, step=0.1)
        first = race.history()
        run(race, clock, {"anna": 1, "ben": 1}, 2, step=0.1)
        more = race.history(since=len(first["points"]), race_id=first["race_id"])
        self.assertEqual(more["from"], len(first["points"]))
        self.assertEqual(more["points"][0][0], 4.0)
        race.reset()
        race.start()
        fresh = race.history(since=len(first["points"]), race_id=first["race_id"])   # Rennen hat gewechselt
        self.assertEqual(fresh["from"], 0)
        self.assertNotEqual(fresh["race_id"], first["race_id"])
        self.assertEqual(len(fresh["points"]), 1)

    def test_solo_history_has_only_one_series(self):
        race, clock = make_race(goal=1000, solo=True)
        race.start()
        run(race, clock, {"anna": 30.0, "ben": 20.0}, 2.2, step=0.1)
        self.assertTrue(all(len(p) == 2 for p in race.history()["points"]))

    def test_final_point_is_recorded_at_finish(self):
        race, clock = make_race(goal=0.1)
        race.start()
        run(race, clock, {"anna": 36.0, "ben": 18.0}, 12, step=0.3)    # Ziel nach 10,0 s
        self.assertAlmostEqual(race.history()["points"][-1][0], 10.0, places=1)

    def test_peak_and_average_power(self):
        race, clock = make_race(goal=1000)
        race.start()
        run(race, clock, {"anna": 20.0, "ben": 10.0}, 5, step=0.1)
        run(race, clock, {"anna": 60.0, "ben": 10.0}, 5, step=0.1)
        run(race, clock, {"anna": 20.0, "ben": 10.0}, 5, step=0.1)
        anna, ben = race.snapshot()["players"]
        self.assertEqual(anna["peak_w"], 60.0)
        self.assertAlmostEqual(anna["avg_w"], 33.33, delta=0.3)
        self.assertAlmostEqual(ben["avg_w"], 10.0, delta=0.1)

    def test_idle_power_does_not_count_for_peak(self):
        race, clock = make_race(goal=1000)
        run(race, clock, {"anna": 500.0, "ben": 500.0}, 2)
        race.start()
        run(race, clock, {"anna": 10.0, "ben": 10.0}, 2)
        self.assertEqual(race.snapshot()["players"][0]["peak_w"], 10.0)


class LegacyResultsTests(unittest.TestCase):
    def test_old_file_format_is_still_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "r.json")
            with open(path, "w") as fh:
                fh.write('{"results": [{"player": "anna", "name": "Anna", "seconds": 61.5, "target_wh": 1.0}, '
                         '{"nonsense": true}, {"mode": "sprint", "goal": 1, "score": 1}]}')
            store = ResultsStore(path)
            best = store.best("energy", 1.0)
            self.assertEqual((best["name"], best["score"]), ("Anna", 61.5))
            self.assertIsNone(store.best("time", 1.0))

    def test_add_rejects_incomplete_result(self):
        with self.assertRaises(ValueError):
            ResultsStore(None).add({"seconds": 3})


if __name__ == "__main__":
    unittest.main()
