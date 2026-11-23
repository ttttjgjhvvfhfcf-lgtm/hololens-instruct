"""Messwertquellen. Jede liefert mit ``read()`` ein Dict ``{spieler_id: watt | None}``.

* ``sim``    – simulierte Leistung zum Entwickeln und Vorführen (kein Sensor nötig)
* ``ina219`` – ein INA219-Strom-/Spannungssensor pro Spieler am I²C-Bus des Raspberry Pi
* ``push``   – ein externes Gerät (ESP32, Arduino, Skript …) schickt die Werte per HTTP
"""
from __future__ import annotations

import logging
import math
import random
import threading
import time

log = logging.getLogger(__name__)


class SimSensor:
    """Zufällige, aber glaubhafte Leistungskurven mit wechselnder Führung."""

    def __init__(self, players: list[dict], seed=None):
        self._rng = random.Random(seed)
        self._t0 = time.monotonic()
        self._state = []
        for p in players:
            base = float(p.get("sim_w", 25.0))
            self._state.append({
                "id": p["id"],
                "base": base,
                "power": base,
                "phase": self._rng.uniform(0, math.tau),
                "period": self._rng.uniform(25.0, 45.0),
            })

    def read(self) -> dict:
        t = time.monotonic() - self._t0
        out = {}
        for s in self._state:
            # Die Anstrengung schwankt langsam (Überholmanöver), dazu schnelles Rauschen.
            target = s["base"] * (1.0 + 0.30 * math.sin(math.tau * t / s["period"] + s["phase"]))
            s["power"] += 0.15 * (target - s["power"]) + self._rng.gauss(0, 0.03 * s["base"])
            s["power"] = min(max(s["power"], 0.0), 2.0 * s["base"])
            out[s["id"]] = s["power"]
        return out

    def close(self) -> None:
        pass


class PushSensor:
    """Hält die zuletzt per ``push()`` gemeldeten Werte; alte Werte gelten als fehlend."""

    def __init__(self, players: list[dict], timeout_s: float = 2.0, clock=time.monotonic):
        self._ids = [p["id"] for p in players]
        self._timeout = timeout_s
        self._clock = clock
        self._lock = threading.Lock()
        self._values: dict[str, tuple[float, float]] = {}

    def push(self, values: dict) -> list[str]:
        """Übernimmt ``{id: watt}``; liefert die Liste unbekannter IDs."""
        unknown = []
        now = self._clock()
        with self._lock:
            for pid, watts in values.items():
                if pid not in self._ids:
                    unknown.append(str(pid))
                elif watts is None:
                    self._values.pop(pid, None)
                else:
                    self._values[pid] = (float(watts), now)
        return unknown

    def read(self) -> dict:
        now = self._clock()
        with self._lock:
            return {
                pid: (self._values[pid][0] if pid in self._values
                      and now - self._values[pid][1] <= self._timeout else None)
                for pid in self._ids
            }

    def close(self) -> None:
        pass


# --------------------------------------------------------------------------- INA219
_REG_CONFIG = 0x00
_REG_SHUNT = 0x01
_REG_BUS = 0x02

# Konfigurationsregister: 32-V-Bereich, ±320 mV Shunt-Bereich, je 12 Bit mit 8-fach
# Mittelung (~4,3 ms), kontinuierlich Shunt- und Bus-Spannung messen.
_CFG_BRNG_32V = 1 << 13
_CFG_PGA_320MV = 0b11 << 11
_CFG_ADC_12BIT_AVG8 = 0b1011
INA219_CONFIG = (_CFG_BRNG_32V | _CFG_PGA_320MV
                 | (_CFG_ADC_12BIT_AVG8 << 7) | (_CFG_ADC_12BIT_AVG8 << 3) | 0b111)


def _swap16(value: int) -> int:
    """SMBus liefert Little-Endian, der INA219 spricht Big-Endian."""
    return ((value & 0xFF) << 8) | ((value >> 8) & 0xFF)


class Ina219Sensor:
    """Misst Spannung und Strom und rechnet daraus die Leistung.

    Der Strom wird aus dem Spannungsabfall am Shunt berechnet (I = U_shunt / R_shunt);
    das braucht kein Kalibrierungsregister und ist damit unabhängig von der Platine.
    """

    def __init__(self, players: list[dict], bus: int = 1, shunt_ohm: float = 0.1,
                 bus_factory=None):
        if bus_factory is None:
            try:
                from smbus2 import SMBus  # erst hier, damit sim/push ohne smbus2 laufen
            except ImportError as exc:
                raise RuntimeError(
                    "Für den INA219 wird smbus2 benötigt: pip install smbus2 "
                    "(und I²C aktivieren: sudo raspi-config → Interface Options → I2C)") from exc
            bus_factory = SMBus
        self._bus = bus_factory(bus)
        self._shunt_ohm = shunt_ohm
        self._channels = [(p["id"], p["address"], bool(p.get("invert", False))) for p in players]
        for pid, addr, _ in self._channels:
            try:
                self._bus.write_word_data(addr, _REG_CONFIG, _swap16(INA219_CONFIG))
            except OSError as exc:
                log.error("INA219 für '%s' (0x%02X) antwortet nicht: %s", pid, addr, exc)

    def _read_register(self, addr: int, reg: int) -> int:
        return _swap16(self._bus.read_word_data(addr, reg))

    def read_channel(self, addr: int) -> tuple[float, float]:
        """Liefert (Spannung in V, Strom in A) eines Sensors."""
        shunt_raw = self._read_register(addr, _REG_SHUNT)
        if shunt_raw >= 0x8000:
            shunt_raw -= 0x10000
        bus_raw = self._read_register(addr, _REG_BUS)
        volts = (bus_raw >> 3) * 0.004          # 4 mV pro Schritt
        amps = shunt_raw * 10e-6 / self._shunt_ohm  # 10 µV pro Schritt
        return volts, amps

    def read(self) -> dict:
        out = {}
        for pid, addr, invert in self._channels:
            try:
                volts, amps = self.read_channel(addr)
                out[pid] = volts * (-amps if invert else amps)
            except OSError as exc:
                log.warning("INA219 '%s' (0x%02X): Lesefehler: %s", pid, addr, exc)
                out[pid] = None
        return out

    def close(self) -> None:
        try:
            self._bus.close()
        except Exception:  # noqa: BLE001 - beim Beenden ist alles egal
            pass


def make_sensor(cfg: dict):
    sensor = cfg["sensor"]
    players = cfg["players"]
    kind = sensor["type"]
    if kind == "sim":
        return SimSensor(players, seed=sensor.get("seed"))
    if kind == "push":
        return PushSensor(players, timeout_s=sensor.get("timeout_s", 2.0))
    if kind == "ina219":
        return Ina219Sensor(players, bus=sensor["bus"], shunt_ohm=sensor["shunt_ohm"])
    raise ValueError(f"Unbekannter Sensortyp: {kind}")
