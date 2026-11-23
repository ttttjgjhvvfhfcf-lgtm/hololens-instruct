'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../static/js/util.js');

test('fmtWh: ganze Zahlen unter 10 mit einer Nachkommastelle', () => {
  assert.equal(U.fmtWh(1), '1.0');
  assert.equal(U.fmtWh(0.5), '0.5');
  assert.equal(U.fmtWh(0.1), '0.1');
  assert.equal(U.fmtWh(12), '12');
  assert.equal(U.fmtWh(0.125), '0.125');
  assert.equal(U.fmtWh(1000), '1000');
});

test('fmtClock / fmtClockTenths', () => {
  assert.equal(U.fmtClock(0), '00:00');
  assert.equal(U.fmtClock(12.9), '00:12');
  assert.equal(U.fmtClock(60), '01:00');
  assert.equal(U.fmtClock(3600), '60:00');
  assert.equal(U.fmtClock(-3), '00:00');
  assert.equal(U.fmtClockTenths(100.25), '01:40.2');
  assert.equal(U.fmtClockTenths(5.5), '00:05.5');
});

test('fmtPower', () => {
  assert.equal(U.fmtPower(null), '–');
  assert.equal(U.fmtPower(28.4), '28');
  assert.equal(U.fmtPower(3.46), '3.5');
  assert.equal(U.fmtPower(0), '0.0');
});

test('goalText', () => {
  assert.equal(U.goalText('energy', 1), '1.0 Wh');
  assert.equal(U.goalText('time', 90), '01:30');
});

test('stepGoal energy geht über alle Bereiche und rastet ein', () => {
  const up = (v) => U.stepGoal('energy', v, 1);
  const down = (v) => U.stepGoal('energy', v, -1);
  assert.equal(up(0.1), 0.2);
  assert.equal(up(0.9), 1);
  assert.equal(up(1), 1.5);
  assert.equal(down(1), 0.9);
  assert.equal(up(4.5), 5);
  assert.equal(up(5), 6);
  assert.equal(down(5), 4.5);
  assert.equal(up(20), 25);
  assert.equal(down(20), 19);
  assert.equal(up(100), 150);
  assert.equal(down(100), 95);
  assert.equal(up(1000), 1000);
  assert.equal(down(0.1), 0.1);
  assert.equal(up(1.3), 1.5);     // krummer Wert springt aufs Raster
  assert.equal(down(1.3), 1);
});

test('stepGoal time', () => {
  const up = (v) => U.stepGoal('time', v, 1);
  const down = (v) => U.stepGoal('time', v, -1);
  assert.equal(up(5), 10);
  assert.equal(down(5), 5);
  assert.equal(up(30), 40);
  assert.equal(down(30), 25);
  assert.equal(up(60), 70);
  assert.equal(up(120), 150);
  assert.equal(down(120), 110);
  assert.equal(up(600), 660);
  assert.equal(down(600), 570);
  assert.equal(up(3600), 3600);
  assert.equal(up(62), 70);
  assert.equal(down(62), 60);
});

test('jeder Zielwert ist über Schritte von Minimum bis Maximum erreichbar (endlich viele Schritte)', () => {
  for (const mode of ['energy', 'time']) {
    const [lo, hi] = U.LIMITS[mode];
    let v = lo; let n = 0;
    while (v < hi && n++ < 1000) { const next = U.stepGoal(mode, v, 1); assert.ok(next > v, `${mode} bleibt bei ${v} hängen`); v = next; }
    assert.equal(v, hi, mode);
    assert.ok(n < 120, `${mode}: ${n} Schritte`);
    while (v > lo && n-- > 0) { const next = U.stepGoal(mode, v, -1); assert.ok(next < v); v = next; }
    assert.equal(v, lo, mode);
  }
});

test('presetLabel', () => {
  assert.equal(U.presetLabel('energy', 0.5), '0.5 Wh');
  assert.equal(U.presetLabel('energy', 2), '2.0 Wh');
  assert.equal(U.presetLabel('time', 30), '30 s');
  assert.equal(U.presetLabel('time', 120), '2 min');
});

test('compare: 1 Wh', () => {
  const [phone, led, laptop] = U.compare(1);
  assert.equal(phone.text, '6.7 % geladen');
  assert.equal(led.text, '6 min Licht');
  assert.equal(laptop.text, '72 s Betrieb');
  assert.equal(U.compare(0)[0].text, '0.0 % geladen');
  assert.equal(U.compare(100)[1].text, '10.0 h Licht');
});

test('fmtDuration', () => {
  assert.equal(U.fmtDuration(45), '45 s');
  assert.equal(U.fmtDuration(120), '2 min');
  assert.equal(U.fmtDuration(7200), '2.0 h');
});

test('estimateText: Orientierung für die Einstellung', () => {
  assert.equal(U.estimateText('energy', 1), '≈ 2 min bei 30 W');
  assert.equal(U.estimateText('energy', 0.1), '≈ 12 s bei 30 W');
  assert.equal(U.estimateText('time', 60), '≈ 0.5 Wh bei 30 W');
  assert.equal(U.estimateText('time', 3600), '≈ 30 Wh bei 30 W');
});
