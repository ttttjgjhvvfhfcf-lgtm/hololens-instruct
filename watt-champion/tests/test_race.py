import os
import tempfile
import unittest

from wattchamp.race import COUNTDOWN, FINISHED, IDLE, RUNNING, Race
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
        race, clock = make_race(target_wh=10)
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
        race, clock = make_race(target_wh=10)
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
        race, clock = make_race(target_wh=10, max_step_s=1.0)
        race.start()
        clock.advance(60)  # Sampler hing eine Minute
        race.update({"anna": 3600.0, "ben": 0})  # 1 Wh/s
        self.assertAlmostEqual(race.snapshot()["players"][0]["energy_mwh"], 1000.0, delta=1)


class FinishTests(unittest.TestCase):
    def test_winner_and_interpolated_time(self):
        race, clock = make_race(target_wh=1.0)
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
            race, clock = make_race(target_wh=1.0)
            race.start()
            times.append(run(race, clock, {"anna": 36.0, "ben": 10.0}, 105, step=step)["seconds"])
        for t in times:
            self.assertAlmostEqual(t, 100.0, delta=0.05)

    def test_frozen_after_finish(self):
        race, clock = make_race(target_wh=0.1)
        race.start()
        run(race, clock, {"anna": 60.0, "ben": 30.0}, 8)
        before = race.snapshot()
        run(race, clock, {"anna": 60.0, "ben": 60.0}, 30)
        after = race.snapshot()
        self.assertEqual(before["elapsed"], after["elapsed"])
        self.assertEqual([p["energy_mwh"] for p in before["players"]],
                         [p["energy_mwh"] for p in after["players"]])

    def test_earliest_crossing_wins_within_one_step(self):
        race, clock = make_race(target_wh=1.0, max_step_s=1000)
        race.start()
        # Ein einziger großer Schritt: ben ist schneller und kreuzt früher
        clock.advance(100)
        result = race.update({"anna": 40.0, "ben": 90.0})
        self.assertEqual(result["player"], "ben")
        self.assertAlmostEqual(result["seconds"], 40.0, places=2)  # 1 Wh / 90 W = 40 s
        anna = race.snapshot()["players"][0]
        self.assertAlmostEqual(anna["energy_mwh"], 40.0 * 40 / 3.6, delta=0.5)

    def test_start_again_after_finish(self):
        race, clock = make_race(target_wh=0.1)
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
        race, clock = make_race(countdown_s=3, target_wh=10)
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
        race, clock = make_race(target_wh=10)
        race.start()
        run(race, clock, {"anna": 50, "ben": 50}, 3)
        race.reset()
        snap = race.snapshot()
        self.assertEqual(snap["state"], IDLE)
        self.assertEqual(snap["elapsed"], 0.0)
        self.assertEqual([p["energy_mwh"] for p in snap["players"]], [0.0, 0.0])

    def test_invalid_arguments(self):
        with self.assertRaises(ValueError):
            Race(PLAYERS, target_wh=0)
        with self.assertRaises(ValueError):
            Race(PLAYERS[:1])


class StatusTests(unittest.TestCase):
    def statuses(self, anna_w, ben_w, seconds=20):
        race, clock = make_race(target_wh=1.0, tie_threshold=0.10)
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
        race, clock = make_race(target_wh=10)
        race.start()
        run(race, clock, {"anna": 10, "ben": 30}, 5)
        self.assertEqual([p["rank"] for p in race.snapshot()["players"]], [2, 1])

    def test_three_players(self):
        players = PLAYERS + [{"id": "cem", "name": "Cem", "color": "green"}]
        clock = FakeClock()
        race = Race(players, target_wh=1.0, countdown_s=0, clock=clock, tie_threshold=0.10)
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
        race, clock = make_race(target_wh=0.1, results=store)
        race.start()
        run(race, clock, {"anna": anna_w, "ben": 1.0}, 30)
        return race.snapshot()

    def test_first_result_is_record_and_persisted(self):
        store = ResultsStore(self.path)
        self.assertIsNone(store.best(0.1))
        snap = self.finish_race(store, 36.0)  # 0.1 Wh / 36 W = 10 s
        self.assertTrue(snap["new_record"])
        self.assertAlmostEqual(snap["record"]["seconds"], 10.0, places=1)
        reloaded = ResultsStore(self.path)
        self.assertAlmostEqual(reloaded.best(0.1)["seconds"], 10.0, places=1)
        self.assertEqual(reloaded.best(0.1)["name"], "Anna")

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
        self.assertIsNone(store.best(1.0))

    def test_corrupt_file_starts_empty(self):
        os.makedirs(os.path.dirname(self.path))
        with open(self.path, "w") as fh:
            fh.write("{kaputt")
        self.assertIsNone(ResultsStore(self.path).best(0.1))

    def test_unwritable_path_does_not_crash(self):
        blocker = os.path.join(self.tmp.name, "file")
        open(blocker, "w").close()
        store = ResultsStore(os.path.join(blocker, "results.json"))  # Elternteil ist eine Datei
        self.assertTrue(store.add({"seconds": 5.0, "target_wh": 1.0}))


if __name__ == "__main__":
    unittest.main()
