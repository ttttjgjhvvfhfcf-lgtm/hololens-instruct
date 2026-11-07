import json
import os
import tempfile
import unittest

from wattchamp.config import ConfigError, load_config


class ConfigTests(unittest.TestCase):
    def write(self, data):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = os.path.join(tmp.name, "config.json")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(data if isinstance(data, str) else json.dumps(data))
        return path

    def test_defaults_without_file(self):
        cfg = load_config(None)
        self.assertEqual(cfg["sensor"]["type"], "sim")
        self.assertEqual([p["id"] for p in cfg["players"]], ["anna", "ben"])
        self.assertEqual(cfg["host"], "127.0.0.1")  # nicht im Netz erreichbar, solange nicht gewollt

    def test_mode_defaults(self):
        cfg = load_config(None)
        self.assertEqual((cfg["mode"], cfg["target_wh"], cfg["time_goal_s"], cfg["solo"]),
                         ("energy", 1.0, 60, False))

    def test_shipped_configs_are_valid(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        for name in ("config.json", "config.ina219.example.json", "config.push.example.json"):
            with self.subTest(name):
                load_config(os.path.join(root, name))

    def test_user_values_override_and_paths_resolve_next_to_file(self):
        path = self.write({"target_wh": 2.5, "results_file": "x/r.json"})
        cfg = load_config(path)
        self.assertEqual(cfg["target_wh"], 2.5)
        self.assertEqual(cfg["results_file"], os.path.join(os.path.dirname(path), "x/r.json"))

    def test_results_file_can_be_disabled(self):
        self.assertIsNone(load_config(self.write({"results_file": None}))["results_file"])

    def test_ina219_addresses_parsed(self):
        path = self.write({
            "sensor": {"type": "ina219"},
            "players": [{"id": "a", "address": "0x40"}, {"id": "b", "address": 65}],
        })
        cfg = load_config(path)
        self.assertEqual([p["address"] for p in cfg["players"]], [0x40, 0x41])
        self.assertEqual(cfg["sensor"]["shunt_ohm"], 0.1)

    def test_errors(self):
        bad = {
            "kein json": "{nope",
            "unbekannter schlüssel": {"tittle": "x"},
            "ziel null": {"target_wh": 0},
            "port": {"port": 99999},
            "ein spieler": {"players": [{"id": "a"}]},
            "drei spieler": {"players": [{"id": "a"}, {"id": "b"}, {"id": "c"}]},
            "modus": {"mode": "sprint"},
            "solo kein bool": {"solo": "ja"},
            "ziel zu klein": {"target_wh": 0.05},
            "ziel zu groß": {"target_wh": 1001},
            "zeitlimit zu kurz": {"time_goal_s": 4},
            "zeitlimit zu lang": {"time_goal_s": 3601},
            "doppelte id": {"players": [{"id": "a"}, {"id": "a"}]},
            "id ungültig": {"players": [{"id": "A b"}, {"id": "b"}]},
            "farbe": {"players": [{"id": "a", "color": "pink"}, {"id": "b"}]},
            "sensor typ": {"sensor": {"type": "magic"}},
            "ina ohne adresse": {"sensor": {"type": "ina219"}},
            "ina gleiche adresse": {"sensor": {"type": "ina219"}, "players": [
                {"id": "a", "address": "0x40"}, {"id": "b", "address": "0x40"}]},
            "ina adresse kaputt": {"sensor": {"type": "ina219"}, "players": [
                {"id": "a", "address": "zz"}, {"id": "b", "address": "0x41"}]},
            "bool als zahl": {"sample_hz": True},
        }
        for label, data in bad.items():
            with self.subTest(label), self.assertRaises(ConfigError):
                load_config(self.write(data))

    def test_missing_file(self):
        with self.assertRaises(ConfigError):
            load_config("/nonexistent/config.json")


if __name__ == "__main__":
    unittest.main()
