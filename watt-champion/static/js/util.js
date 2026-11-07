/* Formatierung, Zielwert-Schritte und Vergleichswerte – ohne DOM, damit sie testbar sind. */
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.WCUtil = exported;
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const LIMITS = { energy: [0.1, 1000], time: [5, 3600] };

  const COLORS = {
    red: '#ff4a3d', cyan: '#2ee6d6', green: '#62e66a', magenta: '#f45bd6',
    orange: '#ff9a2e', blue: '#5aa2ff', ghost: '#8f98ab',
  };

  const pad2 = (n) => String(n).padStart(2, '0');

  /** "1.0", "0.5", "12" – ganze Zahlen unter 10 mit einer Nachkommastelle wie im Entwurf. */
  function fmtWh(v) {
    if (Number.isInteger(v) && v < 10) return v.toFixed(1);
    return String(+v.toFixed(3));
  }

  /** mm:ss (bei mehr als 99 Minuten wächst die Minutenzahl einfach mit). */
  function fmtClock(seconds) {
    const whole = Math.max(0, Math.floor(seconds + 1e-9));
    return `${pad2(Math.floor(whole / 60))}:${pad2(whole % 60)}`;
  }

  function fmtClockTenths(seconds) {
    const s = Math.max(0, seconds);
    const whole = Math.floor(s + 1e-9);
    return `${fmtClock(whole)}.${Math.min(9, Math.floor((s - whole) * 10 + 1e-9))}`;
  }

  function fmtPower(w) {
    if (w === null || w === undefined) return '–';
    return w < 10 ? w.toFixed(1) : String(Math.round(w));
  }

  /** Ziel für Anzeige, z. B. "1.0 Wh" oder "01:00". */
  function goalText(mode, goal) {
    return mode === 'time' ? fmtClock(goal) : `${fmtWh(goal)} Wh`;
  }

  // Schrittweite je Bereich: feiner bei kleinen, gröber bei großen Zielen.
  const STEPS = {
    energy: [[1, 0.1], [5, 0.5], [20, 1], [100, 5], [Infinity, 50]],
    time: [[30, 5], [120, 10], [600, 30], [Infinity, 60]],
  };

  function stepSize(mode, value, dir) {
    const row = STEPS[mode].find(([upTo]) => (dir > 0 ? value < upTo - 1e-9 : value <= upTo + 1e-9));
    return row[1];
  }

  /** Nächster Zielwert in Richtung ``dir`` (+1/-1), rastet auf das Raster ein und bleibt in den Grenzen. */
  function stepGoal(mode, value, dir) {
    const [lo, hi] = LIMITS[mode];
    const step = stepSize(mode, value, dir);
    const q = value / step;
    const n = dir > 0 ? Math.floor(q + 1e-9) + 1 : Math.ceil(q - 1e-9) - 1;
    const next = mode === 'energy' ? +(n * step).toFixed(3) : Math.round(n * step);
    return Math.min(hi, Math.max(lo, next));
  }

  const PRESETS = {
    energy: [0.5, 1, 2, 5, 10],
    time: [30, 60, 120, 300],
  };

  function presetLabel(mode, v) {
    if (mode === 'energy') return `${fmtWh(v)} Wh`;
    return v < 60 ? `${v} s` : `${v / 60} min`;
  }

  // ------------------------------------------------------------------ Vergleiche
  function fmtPct(p) {
    return `${p < 10 ? p.toFixed(1) : Math.round(p)} %`;
  }

  function fmtDuration(seconds) {
    if (seconds < 90) return `${Math.round(seconds)} s`;
    if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
    return `${(seconds / 3600).toFixed(1)} h`;
  }

  // Richtwerte: übliche Smartphone-Akkus haben rund 15 Wh.
  const COMPARISONS = [
    { key: 'phone', label: 'Handy-Akku', hint: '15 Wh', text: (wh) => `${fmtPct((wh / 15) * 100)} geladen` },
    { key: 'led', label: 'LED-Lampe', hint: '10 W', text: (wh) => `${fmtDuration((wh / 10) * 3600)} Licht` },
    { key: 'laptop', label: 'Laptop', hint: '50 W', text: (wh) => `${fmtDuration((wh / 50) * 3600)} Betrieb` },
  ];

  function compare(wh) {
    return COMPARISONS.map((c) => ({ key: c.key, label: c.label, hint: c.hint, text: c.text(wh) }));
  }

  // Eine Orientierung für die Einstellung: so lange dauert das Ziel bei einer typischen Leistung.
  const TYPICAL_W = 30;
  function estimateText(mode, goal) {
    return mode === 'time'
      ? `≈ ${fmtWh((TYPICAL_W * goal) / 3600)} Wh bei ${TYPICAL_W} W`
      : `≈ ${fmtDuration((goal / TYPICAL_W) * 3600)} bei ${TYPICAL_W} W`;
  }

  return {
    LIMITS, COLORS, PRESETS, estimateText, fmtWh, fmtClock, fmtClockTenths, fmtPower, goalText, stepGoal,
    presetLabel, fmtPct, fmtDuration, compare,
  };
}));
