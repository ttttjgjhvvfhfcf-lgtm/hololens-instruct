import unittest

from wattchamp.sensors import (INA219_CONFIG, Ina219Sensor, PushSensor, SimSensor,
                               make_sensor)

PLAYERS = [{"id": "anna", "address": 0x40}, {"id": "ben", "address": 0x41, "invert": True}]


def swap16(v):
    return ((v & 0xFF) << 8) | (v >> 8)


class FakeBus:
    """Simuliert INA219 am SMBus (Little-Endian-Wortzugriff, Gerät ist Big-Endian)."""

    def __init__(self, bus_no):
        self.bus_no = bus_no
        self.regs = {}  # (addr, reg) -> logischer 16-Bit-Wert
        self.fail = set()
        self.closed = False

    def set_measurement(self, addr, volts, amps, shunt_ohm=0.1):
        bus_raw = (round(volts / 0.004) << 3) | 0b10  # CNVR-Flag in den unteren Bits
        shunt_raw = round(amps * shunt_ohm / 10e-6)
        self.regs[(addr, 0x02)] = bus_raw & 0xFFFF
        self.regs[(addr, 0x01)] = shunt_raw & 0xFFFF

    def write_word_data(self, addr, reg, value):
        if addr in self.fail:
            raise OSError(121, "Remote I/O error")
        self.regs[(addr, reg)] = swap16(value)

    def read_word_data(self, addr, reg):
        if addr in self.fail:
            raise OSError(121, "Remote I/O error")
        return swap16(self.regs[(addr, reg)])

    def close(self):
        self.closed = True


class Ina219Tests(unittest.TestCase):
    def make(self, **kw):
        self.bus = None

        def factory(n):
            self.bus = FakeBus(n)
            return self.bus

        sensor = Ina219Sensor(PLAYERS, bus_factory=factory, **kw)
        return sensor

    def test_config_register_matches_datasheet_default_layout(self):
        # 0x399F ist der Reset-Wert (32 V, ±320 mV, 12 Bit, kontinuierlich);
        # unsere Konfiguration unterscheidet sich nur durch die 8-fache Mittelung.
        self.assertEqual(INA219_CONFIG & 0xE000, 0x2000)   # 32-V-Bereich
        self.assertEqual(INA219_CONFIG & 0x1800, 0x1800)   # ±320 mV
        self.assertEqual(INA219_CONFIG & 0x0007, 0x0007)   # Shunt + Bus kontinuierlich
        self.assertEqual((INA219_CONFIG >> 7) & 0xF, 0b1011)
        self.assertEqual((INA219_CONFIG >> 3) & 0xF, 0b1011)

    def test_writes_config_to_every_device(self):
        self.make()
        self.assertEqual(self.bus.regs[(0x40, 0x00)], INA219_CONFIG)
        self.assertEqual(self.bus.regs[(0x41, 0x00)], INA219_CONFIG)

    def test_power_from_voltage_and_current(self):
        sensor = self.make()
        self.bus.set_measurement(0x40, volts=12.0, amps=2.0)
        self.bus.set_measurement(0x41, volts=5.0, amps=-1.0)  # negativ + invert
        out = sensor.read()
        self.assertAlmostEqual(out["anna"], 24.0, places=1)
        self.assertAlmostEqual(out["ben"], 5.0, places=1)

    def test_negative_current_without_invert_is_negative(self):
        sensor = self.make()
        self.bus.set_measurement(0x40, volts=12.0, amps=-2.0)
        self.bus.set_measurement(0x41, volts=0.0, amps=0.0)
        self.assertAlmostEqual(sensor.read()["anna"], -24.0, places=1)

    def test_shunt_resistance_is_used(self):
        sensor = self.make(shunt_ohm=0.01)
        self.bus.set_measurement(0x40, volts=10.0, amps=5.0, shunt_ohm=0.01)
        self.bus.set_measurement(0x41, volts=0.0, amps=0.0)
        self.assertAlmostEqual(sensor.read()["anna"], 50.0, places=1)

    def test_one_failing_device_gives_none_for_that_player_only(self):
        sensor = self.make()
        self.bus.set_measurement(0x40, volts=12.0, amps=1.0)
        self.bus.set_measurement(0x41, volts=12.0, amps=1.0)
        self.bus.fail.add(0x41)
        out = sensor.read()
        self.assertAlmostEqual(out["anna"], 12.0, places=1)
        self.assertIsNone(out["ben"])

    def test_constructor_survives_missing_device(self):
        def factory(n):
            bus = FakeBus(n)
            bus.fail.add(0x41)
            return bus

        Ina219Sensor(PLAYERS, bus_factory=factory)  # darf nicht werfen

    def test_close(self):
        sensor = self.make()
        sensor.close()
        self.assertTrue(self.bus.closed)


class PushTests(unittest.TestCase):
    def test_values_expire(self):
        now = [0.0]
        sensor = PushSensor([{"id": "anna"}, {"id": "ben"}], timeout_s=2.0, clock=lambda: now[0])
        self.assertEqual(sensor.read(), {"anna": None, "ben": None})
        self.assertEqual(sensor.push({"anna": 12.5}), [])
        self.assertEqual(sensor.read(), {"anna": 12.5, "ben": None})
        now[0] = 1.9
        self.assertEqual(sensor.read()["anna"], 12.5)
        now[0] = 2.1
        self.assertIsNone(sensor.read()["anna"])

    def test_unknown_ids_are_reported(self):
        sensor = PushSensor([{"id": "anna"}])
        self.assertEqual(sensor.push({"anna": 1, "zoe": 2}), ["zoe"])
        self.assertEqual(sensor.read(), {"anna": 1.0})

    def test_null_clears_value(self):
        sensor = PushSensor([{"id": "anna"}])
        sensor.push({"anna": 5})
        sensor.push({"anna": None})
        self.assertIsNone(sensor.read()["anna"])


class SimTests(unittest.TestCase):
    def test_values_are_plausible_and_seed_is_reproducible(self):
        players = [{"id": "anna", "sim_w": 30}, {"id": "ben", "sim_w": 20}]
        a, b = SimSensor(players, seed=1), SimSensor(players, seed=1)
        for _ in range(300):
            va, vb = a.read(), b.read()
            self.assertEqual(va.keys(), {"anna", "ben"})
            self.assertTrue(0 <= va["anna"] <= 60 and 0 <= va["ben"] <= 40)
        self.assertEqual(a.read().keys(), b.read().keys())

    def test_factory(self):
        cfg = {"sensor": {"type": "sim"}, "players": [{"id": "a"}, {"id": "b"}]}
        self.assertIsInstance(make_sensor(cfg), SimSensor)
        cfg["sensor"] = {"type": "push", "timeout_s": 1}
        self.assertIsInstance(make_sensor(cfg), PushSensor)


if __name__ == "__main__":
    unittest.main()
