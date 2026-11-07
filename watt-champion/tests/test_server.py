import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from wattchamp.app import App
from wattchamp.config import load_config
from wattchamp.web import make_server


class ServerTestCase(unittest.TestCase):
    sensor = {"type": "push"}

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cfg = load_config(None)
        cfg["sensor"] = dict(cls.sensor)
        if cfg["sensor"]["type"] == "push":
            cfg["sensor"]["timeout_s"] = 2.0
        cfg["countdown_s"] = 0
        cfg["results_file"] = os.path.join(cls.tmp.name, "results.json")
        cls.app = App(cfg)
        cls.app.start()  # Abtast-Thread: Sensor -> Rennen
        cls.server = make_server(cls.app, "127.0.0.1", 0)
        cls.base = "http://127.0.0.1:%d" % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.app.stop()
        cls.tmp.cleanup()

    def setUp(self):
        self.app.race.reset()
        self.app.race.configure(mode="energy", goal=0.1, count=2, names={"anna": "Anna", "ben": "Ben"})
        if hasattr(self.app.sensor, "push"):
            self.app.sensor.push({"anna": None, "ben": None})

    def call(self, path, method="GET", body=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as err:
            return err.code, err.headers, err.read()

    def api(self, path, method="GET", body=None, raw=None):
        status, _, payload = self.call(path, method, body, raw)
        return status, json.loads(payload)


class ApiTests(ServerTestCase):
    def test_state(self):
        status, state = self.api("/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(state["state"], "idle")
        self.assertEqual([p["id"] for p in state["players"]], ["anna", "ben"])
        self.assertEqual(state["config"]["title"], "watt champion")

    def test_start_twice_conflicts_then_reset(self):
        self.assertEqual(self.api("/api/start", "POST")[0], 200)
        self.assertEqual(self.api("/api/state")[1]["state"], "running")
        self.assertEqual(self.api("/api/start", "POST")[0], 409)
        status, state = self.api("/api/reset", "POST")
        self.assertEqual((status, state["state"]), (200, "idle"))

    def test_push_measurements_drive_the_race(self):
        # Ziel sind 0,1 Wh: bei 3600 W (1 Wh/s) schafft Anna das in 0,1 s, Ben mit 1000 W nicht.
        self.assertEqual(self.api("/api/start", "POST")[0], 200)
        status, reply = self.api("/api/measurement", "POST", {"anna": 3600.0, "ben": 1000.0, "zoe": 1})
        self.assertEqual((status, reply["unknown_ids"]), (200, ["zoe"]))
        deadline = time.monotonic() + 3
        state = self.api("/api/state")[1]
        while state["state"] != "finished" and time.monotonic() < deadline:
            time.sleep(0.05)
            state = self.api("/api/state")[1]
        self.assertEqual(state["state"], "finished")
        self.assertEqual(state["winner"], "anna")
        anna, ben = state["players"]
        self.assertEqual(anna["energy_mwh"], 100.0)
        self.assertLess(ben["energy_mwh"], 100.0)
        self.assertEqual((anna["status"], ben["status"]), ("winner", "loser"))
        self.assertTrue(state["new_record"])
        self.assertEqual(state["record"]["name"], "Anna")
        self.assertEqual(state["record"]["mode"], "energy")

    def test_setup_changes_mode_goal_players_and_names(self):
        status, state = self.api("/api/setup", "POST", {
            "mode": "time", "goal": 90, "count": 1, "names": {"anna": "Zoë", "ben": "Max"}})
        self.assertEqual(status, 200)
        self.assertEqual((state["mode"], state["goal"], state["count"]), ("time", 90, 1))
        self.assertEqual([p["name"] for p in state["players"]], ["Zoë"])
        self.assertEqual([s["name"] for s in state["slots"]], ["Zoë", "Max"])
        self.assertEqual(state["goals"]["time"], 90)
        self.assertEqual(state["limits"], {"energy": [0.1, 1000.0], "time": [5.0, 3600.0]})
        # der Zustand ist beim nächsten Abruf noch derselbe (Server hält die Einstellung)
        self.assertEqual(self.api("/api/state")[1]["goal"], 90)

    def test_setup_validation(self):
        for body in ({"mode": "sprint"}, {"goal": 0}, {"goal": 5000}, {"goal": "x"}, {"count": 3},
                     {"names": {"anna": ""}}, {"names": {"zoe": "Zoe"}}, {"names": "Anna"}):
            with self.subTest(body):
                status, reply = self.api("/api/setup", "POST", body)
                self.assertEqual(status, 400)
                self.assertIn("error", reply)
        self.assertEqual(self.api("/api/setup", "POST", {"farbe": "rot"})[0], 400)
        self.assertEqual(self.api("/api/setup", "POST", raw=b"[1]")[0], 400)
        self.assertEqual(self.api("/api/setup", "POST", raw=b"{nope")[0], 400)
        self.assertEqual(self.api("/api/state")[1]["goal"], 0.1)   # nichts wurde übernommen

    def test_setup_is_refused_during_a_race(self):
        self.api("/api/start", "POST")
        status, reply = self.api("/api/setup", "POST", {"goal": 5})
        self.assertEqual(status, 409)
        self.assertIn("error", reply)

    def test_history_endpoint(self):
        self.api("/api/start", "POST")
        status, h = self.api("/api/history")
        self.assertEqual(status, 200)
        self.assertEqual(h["from"], 0)
        self.assertEqual(h["points"][0][0], 0.0)           # Startpunkt der Kurve
        status, again = self.api("/api/history?from=%d&race=%d" % (len(h["points"]), h["race_id"]))
        self.assertEqual((status, again["from"]), (200, len(h["points"])))
        status, other = self.api("/api/history?from=5&race=%d" % (h["race_id"] + 1000))   # unbekanntes Rennen
        self.assertEqual(other["from"], 0)
        self.assertEqual(self.api("/api/history?from=x")[0], 400)

    def test_measurement_validation(self):
        self.assertEqual(self.api("/api/measurement", "POST", raw=b"{nope")[0], 400)
        self.assertEqual(self.api("/api/measurement", "POST", raw=b"[1,2]")[0], 400)
        self.assertEqual(self.api("/api/measurement", "POST", {"anna": "viel"})[0], 400)
        self.assertEqual(self.api("/api/measurement", "POST", {"anna": True})[0], 400)
        self.assertEqual(self.api("/api/measurement", "POST", raw=b"x" * 5000)[0], 413)

    def test_unknown_endpoints(self):
        self.assertEqual(self.api("/api/nope")[0], 404)
        self.assertEqual(self.api("/api/nope", "POST")[0], 404)


class StaticTests(ServerTestCase):
    def test_index_and_assets(self):
        status, headers, body = self.call("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"watt", body)
        for path, mime in (("/style.css", "text/css"), ("/js/app.js", "javascript"),
                           ("/js/engine.js", "javascript"), ("/js/api.js", "javascript"),
                           ("/fonts/Rajdhani-Bold.woff2", "font/woff2")):
            status, headers, _ = self.call(path)
            self.assertEqual(status, 200, path)
            self.assertIn(mime, headers["Content-Type"], path)

    def test_no_directory_listing_and_no_traversal(self):
        self.assertEqual(self.call("/fonts/")[0], 404)
        self.assertEqual(self.call("/../server.py")[0], 404)
        self.assertEqual(self.call("/%2e%2e/server.py")[0], 404)
        self.assertEqual(self.call("/..%2fconfig.json")[0], 404)


class NonPushSensorTests(ServerTestCase):
    sensor = {"type": "sim"}

    def test_measurement_endpoint_needs_push_sensor(self):
        self.assertEqual(self.api("/api/measurement", "POST", {"anna": 1})[0], 409)


if __name__ == "__main__":
    unittest.main()
