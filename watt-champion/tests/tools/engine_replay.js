'use strict';
// Spielt ein Szenario (JSON auf stdin) mit der Demo-Engine ab und gibt die Schnappschüsse als JSON aus.
const { Race, MemoryResults } = require('../../static/js/engine.js');

const scenario = JSON.parse(require('fs').readFileSync(0, 'utf8'));
let now = 100;
const race = new Race(scenario.players, {
  ...scenario.options, clock: () => now, results: new MemoryResults(null),
});
const out = [];
const call = (fn) => { try { fn(); return null; } catch (e) { return e.constructor.name === 'BusyError' ? 'busy' : 'invalid'; } };
for (const op of scenario.ops) {
  if (op.op === 'start') out.push({ op: 'start', ok: race.start() });
  else if (op.op === 'reset') race.reset();
  else if (op.op === 'configure') out.push({ op: 'configure', error: call(() => race.configure(op.args)) });
  else if (op.op === 'run') {
    const steps = Math.round(op.seconds / op.step);
    for (let i = 0; i < steps; i++) { now += op.step; race.update(op.powers); }
  } else if (op.op === 'snapshot') {
    const snap = race.snapshot();
    if (snap.record) delete snap.record.date;
    out.push({ op: 'snapshot', snapshot: snap, history: race.getHistory(0, null) });
  }
}
process.stdout.write(JSON.stringify(out));
