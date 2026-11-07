/* Demo-Engine: Rennlogik im Browser.
 *
 * Eine getreue Portierung von wattchamp/race.py (+ SimSensor). Sie macht den Demo-Modus
 * möglich: Die Oberfläche läuft dann auch ohne Server, z. B. per Doppelklick auf index.html.
 * Mit dem echten Server wird sie NICHT benutzt – dort rechnet das Python-Backend.
 * Das Ergebnis von snapshot() hat dieselben Felder wie /api/state.
 */
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.WCEngine = exported;
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const IDLE = 'idle';
  const COUNTDOWN = 'countdown';
  const RUNNING = 'running';
  const FINISHED = 'finished';
  const MODES = ['energy', 'time'];
  const LIMITS = { energy: [0.1, 1000], time: [5, 3600] };
  const UNITS = { energy: 'Wh', time: 's' };
  const NAME_MAX = 16;
  const MAX_HISTORY = 7200;
  const HIGHER_IS_BETTER = { energy: false, time: true };

  class BusyError extends Error {}

  const round = (x, digits = 0) => {
    const f = 10 ** digits;
    return Math.round(x * f) / f;
  };
  const fmtG = (x) => String(+x.toPrecision(12));

  // ------------------------------------------------------------------ Rekorde
  class MemoryResults {
    /** @param storage  etwas mit getItem/setItem (localStorage) oder null */
    constructor(storage = null, key = 'wattchampion.demo.results') {
      this.storage = storage;
      this.key = key;
      this.entries = [];
      try {
        const raw = storage && storage.getItem(key);
        if (raw) this.entries = JSON.parse(raw).filter((e) => e && MODES.includes(e.mode));
      } catch (err) { this.entries = []; }
    }

    matching(mode, goal) {
      return this.entries.filter((e) => e.mode === mode && Math.abs(e.goal - goal) < 1e-9);
    }

    static pick(mode, entries) {
      const sign = HIGHER_IS_BETTER[mode] ? -1 : 1;
      return entries.reduce((a, b) => (sign * (b.score - a.score) < 0 ? b : a));
    }

    best(mode, goal) {
      const list = this.matching(mode, goal);
      return list.length ? { ...MemoryResults.pick(mode, list) } : null;
    }

    add(result) {
      const previous = this.matching(result.mode, result.goal);
      let isRecord = true;
      if (previous.length) {
        const best = MemoryResults.pick(result.mode, previous).score;
        isRecord = HIGHER_IS_BETTER[result.mode] ? result.score > best : result.score < best;
      }
      this.entries.push({ ...result, date: new Date().toISOString() });
      this.entries = this.entries.slice(-200);
      try { if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.entries)); } catch (err) { /* voll/gesperrt */ }
      return isRecord;
    }
  }

  // ------------------------------------------------------------------ Rennen
  class Race {
    constructor(players, opts = {}) {
      const o = {
        mode: 'energy', goal: 1, timeGoalS: 60, solo: false, countdownS: 3, tieThreshold: 0.1,
        timeReferenceW: 30, results: null, clock: () => performance.now() / 1000, maxStepS: 1,
        historyIntervalS: 1, ...opts,
      };
      if (players.length < 2) throw new Error('Ein Rennen braucht mindestens zwei Spieler-Plätze');
      if (!MODES.includes(o.mode)) throw new Error(`Unbekannter Modus: ${o.mode}`);
      if (o.goal <= 0 || o.timeGoalS <= 0) throw new Error('Ziele müssen größer als 0 sein');
      this.players = players.map((p) => ({
        id: p.id, name: p.name, color: p.color || 'red', power: null, energy: 0, peak: 0,
      }));
      this.mode = o.mode;
      this.goals = { energy: +o.goal, time: +o.timeGoalS };
      this.count = o.solo ? 1 : this.players.length;
      this.countdownS = +o.countdownS;
      this.tieThreshold = +o.tieThreshold;
      this.timeReferenceW = +o.timeReferenceW;
      this.results = o.results;
      this.clock = o.clock;
      this.maxStep = o.maxStepS;
      this.histInterval = o.historyIntervalS;
      this.raceId = 0;
      this.record = null;
      this.resetRace();
      this.refreshSetup();
    }

    get goal() { return this.goals[this.mode]; }

    get active() { return this.players.slice(0, this.count); }

    // -------------------------------------------------------------- Einstellungen
    static checkGoal(mode, goal) {
      if (typeof goal !== 'number' || !Number.isFinite(goal)) throw new Error('Das Ziel muss eine Zahl sein');
      const [lo, hi] = LIMITS[mode];
      if (goal < lo || goal > hi) {
        throw new Error(`Das Ziel muss zwischen ${fmtG(lo)} und ${fmtG(hi)} ${UNITS[mode]} liegen`);
      }
      return mode === 'energy' ? round(goal, 3) : Math.round(goal);
    }

    checkNames(names) {
      if (names === null || typeof names !== 'object' || Array.isArray(names)) {
        throw new Error('names muss ein Objekt {id: Name} sein');
      }
      const out = {};
      Object.entries(names).forEach(([pid, raw]) => {
        if (!this.players.some((p) => p.id === pid)) throw new Error(`Unbekannter Spieler: ${pid}`);
        if (typeof raw !== 'string') throw new Error('Namen müssen Text sein');
        const name = raw.replace(/\s+/g, ' ').trim();
        // eslint-disable-next-line no-control-regex
        if (name.length < 1 || name.length > NAME_MAX || /[\x00-\x1f]/.test(name)) {
          throw new Error(`Ein Name braucht 1 bis ${NAME_MAX} Zeichen`);
        }
        out[pid] = name;
      });
      return out;
    }

    configure({ mode, goal, count, names } = {}) {
      if (this.state === COUNTDOWN || this.state === RUNNING) {
        throw new BusyError('Während eines Rennens lässt sich nichts ändern');
      }
      const newMode = mode === undefined ? this.mode : mode;
      if (!MODES.includes(newMode)) throw new Error(`Unbekannter Modus: ${mode}`);
      const newGoal = goal === undefined ? null : Race.checkGoal(newMode, goal);
      if (count !== undefined && count !== 1 && count !== this.players.length) {
        throw new Error(`Die Spielerzahl muss 1 oder ${this.players.length} sein`);
      }
      const newNames = names === undefined ? null : this.checkNames(names);

      this.mode = newMode;
      if (newGoal !== null) this.goals[newMode] = newGoal;
      if (count !== undefined) this.count = count;
      this.players.forEach((p) => { if (newNames && newNames[p.id]) p.name = newNames[p.id]; });
      if (this.state === FINISHED) this.resetRace();
      this.refreshSetup();
    }

    refreshSetup() {
      this.record = this.results ? this.results.best(this.mode, this.goal) : null;
      if (this.mode === 'energy') {
        this.refWh = this.goal; this.refKind = 'goal';
      } else if (this.record) {
        this.refWh = Math.max(this.record.score, 1) / 1000; this.refKind = 'record';
      } else {
        this.refWh = (this.timeReferenceW * this.goal) / 3600; this.refKind = 'default';
      }
    }

    // -------------------------------------------------------------- Steuerung
    resetRace() {
      this.state = IDLE;
      this.raceId += 1;
      this.goAt = 0;
      this.t0 = 0;
      this.lastT = 0;
      this.finalElapsed = 0;
      this.winner = null;
      this.newRecord = false;
      this.ghostT = null;
      this.history = [];
      this.players.forEach((p) => { p.energy = 0; p.peak = 0; });
    }

    start() {
      if (this.state === COUNTDOWN || this.state === RUNNING) return false;
      this.resetRace();
      this.refreshSetup();
      if (this.record && this.count === 1) {
        this.ghostT = this.mode === 'energy' ? this.record.score : this.goal;
      }
      const now = this.clock();
      if (this.countdownS > 0) {
        this.state = COUNTDOWN;
        this.goAt = now + this.countdownS;
      } else {
        this.begin(now);
      }
      return true;
    }

    reset() {
      this.resetRace();
      this.refreshSetup();
    }

    begin(t0) {
      this.state = RUNNING;
      this.t0 = t0;
      this.lastT = t0;
      this.sampleHistory(0);
    }

    // -------------------------------------------------------------- Messwerte
    update(powers) {
      const now = this.clock();
      this.players.forEach((p) => {
        const w = powers[p.id];
        p.power = w === undefined || w === null ? null : Math.max(0, +w);
      });
      if (this.state === COUNTDOWN && now >= this.goAt) this.begin(this.goAt);
      if (this.state !== RUNNING) return null;
      return this.step(now);
    }

    step(now) {
      const active = this.active;
      const tEnd = this.t0 + this.goal;
      const horizon = this.mode === 'time' ? Math.min(now, tEnd) : now;
      const stepStart = this.lastT;
      const dt = Math.max(0, Math.min(horizon - stepStart, this.maxStep));
      active.forEach((p) => { if (p.power !== null) p.peak = Math.max(p.peak, p.power); });

      if (this.mode === 'energy') {
        const crossings = [];
        active.forEach((p, idx) => {
          const rate = (p.power || 0) / 3600;
          if (rate > 0 && p.energy + rate * dt >= this.goal) {
            crossings.push([stepStart + (this.goal - p.energy) / rate, idx]);
          }
        });
        if (crossings.length) {
          crossings.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const [tWin, winIdx] = crossings[0];
          const span = Math.max(0, tWin - stepStart);
          active.forEach((p) => { p.energy += ((p.power || 0) / 3600) * span; });
          const winner = active[winIdx];
          winner.energy = this.goal;
          this.finalElapsed = tWin - this.t0;
          return this.finish(winner, winner.id);
        }
      }

      active.forEach((p) => { p.energy += ((p.power || 0) / 3600) * dt; });
      this.lastT = horizon;
      this.sampleHistory(horizon - this.t0);
      if (this.mode === 'time' && now >= tEnd) {
        this.finalElapsed = this.goal;
        const ranked = active.slice().sort((a, b) => b.energy - a.energy);
        const draw = active.length > 1 && Math.abs(ranked[0].energy - ranked[1].energy) < 1e-4;
        return this.finish(ranked[0], draw || active.length === 1 ? null : ranked[0].id);
      }
      return null;
    }

    finish(top, winnerId) {
      this.state = FINISHED;
      this.winner = winnerId;
      this.sampleHistory(this.finalElapsed, true);
      const seconds = round(this.finalElapsed, 2);
      const energyMwh = {};
      this.active.forEach((p) => { energyMwh[p.id] = round(p.energy * 1000, 1); });
      const result = {
        mode: this.mode,
        goal: this.goal,
        player: top.id,
        name: top.name,
        seconds,
        score: this.mode === 'energy' ? seconds : round(top.energy * 1000, 1),
        count: this.count,
        energy_mwh: energyMwh,
      };
      if (this.results) {
        this.newRecord = this.results.add(result);
        this.record = this.results.best(this.mode, this.goal);
      }
      return result;
    }

    sampleHistory(elapsed, force = false) {
      if (this.history.length >= MAX_HISTORY) return;
      const last = this.history[this.history.length - 1];
      if (!force && last && elapsed - last[0] < this.histInterval - 1e-9) return;
      this.history.push([round(elapsed, 2)].concat(
        this.active.map((p) => (p.power === null ? null : round(p.power, 2))),
      ));
    }

    getHistory(since = 0, raceId = null) {
      let from = since;
      if (raceId !== this.raceId || from < 0 || from > this.history.length) from = 0;
      return { race_id: this.raceId, from, points: this.history.slice(from) };
    }

    // -------------------------------------------------------------- Anzeige
    statuses(energies) {
      const n = energies.length;
      if (this.state === FINISHED) {
        if (n === 1) return ['done'];
        if (this.winner === null) return Array(n).fill('draw');
        return this.active.map((p) => (p.id === this.winner ? 'winner' : 'loser'));
      }
      if (this.state !== RUNNING) return Array(n).fill('ready');
      if (n === 1) return ['solo'];
      const leader = Math.max(...energies);
      const gaps = energies.map((e) => (leader - e) / this.refWh);
      const close = (g) => g === 0 || g < this.tieThreshold;
      return gaps.map((gap, idx) => {
        if (gap === 0) return gaps.some((g, j) => j !== idx && close(g)) ? 'tie' : 'lead';
        return close(gap) ? 'tie' : 'trail';
      });
    }

    snapshot() {
      const now = this.clock();
      let countdown = null;
      let elapsed = 0;
      if (this.state === COUNTDOWN) {
        countdown = Math.max(1, Math.ceil(this.goAt - now));
      } else if (this.state === RUNNING) {
        elapsed = Math.max(0, now - this.t0);
        if (this.mode === 'time') elapsed = Math.min(elapsed, this.goal);
      } else if (this.state === FINISHED) {
        elapsed = this.finalElapsed;
      }
      let remaining = null;
      if (this.mode === 'time') {
        remaining = this.state === FINISHED ? 0 : Math.max(0, this.goal - elapsed);
      }

      const active = this.active;
      const energies = active.map((p) => p.energy);
      const order = energies.map((_, i) => i).sort((a, b) => energies[b] - energies[a] || a - b);
      const rank = {};
      order.forEach((idx, pos) => { rank[idx] = pos + 1; });
      const statuses = this.statuses(energies);
      const players = active.map((p, idx) => {
        const ratio = p.energy / this.refWh;
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          power_w: p.power === null ? null : round(p.power, 2),
          energy_mwh: round(p.energy * 1000, 1),
          progress: Math.min(1, ratio),
          ratio,
          rank: rank[idx],
          status: statuses[idx],
          peak_w: round(p.peak, 2),
          avg_w: elapsed >= 1 ? round((p.energy * 3600) / elapsed, 2) : null,
        };
      });

      let ghost = null;
      if (this.ghostT && this.state !== IDLE) {
        ghost = { name: 'Rekord', progress: Math.min(1, elapsed / this.ghostT) };
      }
      const limits = {};
      Object.keys(LIMITS).forEach((m) => { limits[m] = LIMITS[m].slice(); });
      return {
        race_id: this.raceId,
        state: this.state,
        mode: this.mode,
        goal: this.goal,
        goals: { ...this.goals },
        limits,
        count: this.count,
        countdown,
        elapsed: round(elapsed, 2),
        remaining: remaining === null ? null : round(remaining, 2),
        ref_wh: round(this.refWh, 4),
        ref_kind: this.refKind,
        has_data: this.players.some((p) => p.power !== null),
        players,
        slots: this.players.map((p, i) => ({
          id: p.id, name: p.name, color: p.color, active: i < this.count,
          power_w: p.power === null ? null : round(p.power, 2),
        })),
        ghost,
        winner: this.winner,
        record: this.record ? { ...this.record } : null,
        new_record: this.newRecord,
        history_len: this.history.length,
      };
    }
  }

  // ------------------------------------------------------------------ Simulation
  /** Kleiner, seedbarer Zufallsgenerator (mulberry32), damit Läufe reproduzierbar sein können. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class SimSensor {
    constructor(players, { seed = null, clock = () => performance.now() / 1000, speed = 1 } = {}) {
      const rand = mulberry32(seed === null ? Math.floor(Math.random() * 2 ** 31) : seed);
      this.rand = rand;
      this.clock = clock;
      this.t0 = clock();
      this.state = players.map((p) => {
        const base = (p.sim_w || 25) * speed;
        return { id: p.id, base, power: base, phase: rand() * 2 * Math.PI, period: 25 + rand() * 20 };
      });
    }

    gauss() {
      const u = Math.max(this.rand(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rand());
    }

    read() {
      const t = this.clock() - this.t0;
      const out = {};
      this.state.forEach((s) => {
        const target = s.base * (1 + 0.3 * Math.sin((2 * Math.PI * t) / s.period + s.phase));
        s.power += 0.15 * (target - s.power) + this.gauss() * 0.03 * s.base;
        s.power = Math.min(Math.max(s.power, 0), 2 * s.base);
        out[s.id] = s.power;
      });
      return out;
    }
  }

  return {
    Race, SimSensor, MemoryResults, BusyError, LIMITS, MODES, IDLE, COUNTDOWN, RUNNING, FINISHED,
  };
}));
