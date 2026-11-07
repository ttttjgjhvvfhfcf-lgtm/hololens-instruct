(() => {
  'use strict';

  const U = window.WCUtil;
  const { HttpApi, DemoApi } = window.WCApi;
  const { PowerChart } = window.WCChart;
  const { Sound, Confetti } = window.WCFx;
  const { Osk } = window.WCOsk;

  const POLL_MS = 200;        // wie oft der Zustand abgefragt wird
  const HOLD_MS = 1000;       // so lange muss "Abbrechen" gehalten werden
  const GO_FLASH_S = 0.9;     // so lange steht nach dem Start "LOS!" da
  const RESULT_DELAY_MS = 1300;  // Zeit zwischen Zieleinlauf und Ergebnis-Dialog
  const EDIT_GRACE_MS = 1500;    // so lange gilt die eigene Eingabe mehr als der Server-Stand

  const $ = (sel) => document.querySelector(sel);
  const el = {
    body: document.body,
    logo: $('#logo'), goalLabel: $('#goal-label'), goal: $('#goal'), modeChip: $('#mode-chip'),
    simchip: $('#simchip'), sound: $('#sound'), abort: $('#abort'), sponsor: $('#sponsor'),
    tiles: $('#tiles'), countSeg: $('#count-seg'), playerRows: $('#player-rows'),
    goalTitle: $('#goal-title'), goalValue: $('#goal-value'), goalChips: $('#goal-chips'),
    goalHint: $('#goal-hint'), goalEstimate: $('#goal-estimate'), setupRecord: $('#setup-record'), start: $('#start'),
    headline: $('#headline'), lanes: $('#lanes'), cards: $('#cards'),
    timeCaption: $('#time-caption'), time: $('#time'), note: $('#note'),
    chart: $('#chart'), legend: $('#legend'),
    overlay: $('#overlay'), result: $('#result'), resultTitle: $('#result-title'),
    resultSub: $('#result-sub'), resultRibbon: $('#result-ribbon'), resultStats: $('#result-stats'),
    resultCompare: $('#result-compare'), again: $('#again'), againNew: $('#again-new'),
    osk: $('#osk'), toast: $('#toast'), offline: $('#offline'),
  };

  // ---------------------------------------------------------------- Symbole
  const ICONS = {
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="8"/><path d="M12 9v4.8l3 1.8M9.5 2.5h5"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4v2.2A3.3 3.3 0 0 0 7.3 11M17 5.5h3v2.2a3.3 3.3 0 0 1-3.3 3.3M12 14v4M8 21h8M9.5 18h5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M10.8 18.5h2.4"/></svg>',
    led: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 18h5M10.2 21h3.6M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.4 1.1 2.4h5.4c0-1 .4-1.8 1.1-2.4A6 6 0 0 0 12 3z"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="5" width="15" height="10.5" rx="1.6"/><path d="M2.5 19.5h19"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.2L16.3 4.5l3.2 3.2L8.2 19z"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.8l5.2 4V5.5l-5.2 4z" fill="currentColor" stroke-width="1.2"/><path d="M16.2 9a4.2 4.2 0 0 1 0 6M18.8 6.4a8 8 0 0 1 0 11.2"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.8l5.2 4V5.5l-5.2 4z" fill="currentColor" stroke-width="1.2"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>',
  };

  const CAR_SVG = `
<svg viewBox="0 0 120 48" aria-hidden="true">
  <ellipse cx="60" cy="45.5" rx="50" ry="2.4" fill="rgba(0,0,0,.5)"/>
  <path class="car-body" d="M8 35V28Q8 24 13 23.2L34 21.5 46 11.5Q48 10 51 10H72Q75 10 77 11.5L91 21.5 106 24Q113 25.2 114 30V35Z"/>
  <path class="car-glass" d="M38.5 21.2 47.6 12.6Q49 12 51 12H60V21.2ZM64 12H72Q74 12 75.4 13L86 21.2H64Z"/>
  <path class="car-line" d="M62 12.5V35"/>
  <rect x="109.5" y="26.5" width="4.5" height="3" rx="1.2" fill="#ffe9a8"/>
  <rect x="8" y="26.5" width="3.2" height="3" rx="1" fill="#ff5a4d"/>
  <g transform="translate(30 38)"><circle r="10.5" fill="#12151c"/><g class="wheel"><circle r="8" fill="#10131a" stroke="#eef1f7" stroke-width="2"/><path d="M0-6V6M-6 0H6" stroke="#9aa3b5" stroke-width="1.4"/><circle r="2.4" fill="#9aa3b5"/></g></g>
  <g transform="translate(92 38)"><circle r="10.5" fill="#12151c"/><g class="wheel"><circle r="8" fill="#10131a" stroke="#eef1f7" stroke-width="2"/><path d="M0-6V6M-6 0H6" stroke="#9aa3b5" stroke-width="1.4"/><circle r="2.4" fill="#9aa3b5"/></g></g>
</svg>`;

  const fillIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach((n) => {
    n.innerHTML = ICONS[n.dataset.icon] || '';
  });
  fillIcons();

  function node(tag, className, html) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // ---------------------------------------------------------------- API (Server oder Demo)
  const params = new URLSearchParams(window.location.search);
  const demoSpeed = Math.max(0.1, Math.min(50, parseFloat(params.get('speed')) || 1));
  let api = (window.location.protocol === 'file:' || params.has('demo'))
    ? new DemoApi({ speed: demoSpeed }) : new HttpApi();
  let everConnected = false;

  // ---------------------------------------------------------------- Zustand
  let state = null;           // letzter Stand vom Server
  let local = null;           // Einstellungen, wie die Oberfläche sie gerade zeigt (sofort, ohne Warten)
  let pending = {};           // noch nicht gesendete Änderungen
  let editedAt = 0;
  let flushTimer = null;
  let prev = null;            // vorheriger Stand für Übergänge (Töne, Konfetti)
  let finishedAt = 0;
  let lastCountdown = null;
  let hist = { raceId: null, points: [] };

  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.toast.hidden = true; }, 3500);
  }

  function syncLocal(s) {
    const fresh = !local;
    const idle = Date.now() - editedAt > EDIT_GRACE_MS && !Object.keys(pending).length;
    if (fresh || idle) {
      local = {
        mode: s.mode,
        count: s.count,
        goals: { ...s.goals },
        names: Object.fromEntries(s.slots.map((p) => [p.id, p.name])),
      };
    }
  }

  async function flushSetup() {
    clearTimeout(flushTimer);
    if (!Object.keys(pending).length) return true;
    const body = pending;
    pending = {};
    try {
      const s = await api.post('/api/setup', body);
      editedAt = 0;
      render(s);
      return true;
    } catch (err) {
      editedAt = 0;
      toast(err.message);
      return false;
    }
  }

  function sendSetup(partial) {
    pending = { ...pending, ...partial };
    editedAt = Date.now();
    if (partial.mode) local.mode = partial.mode;
    if (partial.count) local.count = partial.count;
    if (partial.goal !== undefined) local.goals[local.mode] = partial.goal;
    if (partial.names) Object.assign(local.names, partial.names);
    renderSetup(state);
    renderHeader(state);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushSetup, 220);
  }

  async function command(path) {
    try {
      render(await api.post(path));
    } catch (err) {
      toast(err.message);
      poll();
    }
  }

  async function startRace() {
    if (!(await flushSetup())) return;
    await command('/api/start');
  }

  // ---------------------------------------------------------------- Kopfzeile
  function renderHeader(s) {
    const inRace = s.state !== 'idle';
    const mode = inRace ? s.mode : local.mode;
    const goal = inRace ? s.goal : local.goals[local.mode];
    const count = inRace ? s.count : local.count;
    el.goalLabel.textContent = mode === 'time' ? 'Zeit:' : 'Ziel:';
    el.goal.textContent = mode === 'time' ? U.fmtClock(goal) : `${U.fmtWh(goal)} Wh`;
    el.modeChip.hidden = !inRace;
    el.modeChip.textContent = `${mode === 'time' ? 'Zeit' : 'Energie'} · ${count === 1 ? 'Solo' : '1 vs 1'}`;
    el.body.dataset.mode = mode;
    el.body.dataset.count = count;

    const cfg = s.config || {};
    el.simchip.hidden = !['sim', 'demo'].includes(cfg.sensor);
    el.simchip.textContent = cfg.sensor === 'demo' ? 'Demo' : 'Simulation';
    const words = (cfg.title || 'watt champion').trim().split(/\s+/);
    if (el.logo.dataset.title !== cfg.title) {
      el.logo.dataset.title = cfg.title || '';
      el.logo.replaceChildren(node('span', null, words[0]),
        ...(words.length > 1 ? [node('span', null, words.slice(1).join(' '))] : []));
      document.title = cfg.title || 'watt champion';
    }
    if (cfg.sponsor_logo) {
      if (el.sponsor.getAttribute('src') !== cfg.sponsor_logo) el.sponsor.src = cfg.sponsor_logo;
      el.sponsor.hidden = false;
    } else {
      el.sponsor.hidden = true;
    }
    el.abort.hidden = !['countdown', 'running'].includes(s.state);
  }

  // ---------------------------------------------------------------- Einstellungen
  const ui = { rowsSig: '', chipsMode: null, rows: [] };

  function recordText(record, mode) {
    if (!record) return null;
    return mode === 'time'
      ? `Rekord: ${Math.round(record.score)} mWh · ${record.name}`
      : `Rekord: ${U.fmtClock(record.score)} · ${record.name}`;
  }

  function renderSetup(s) {
    el.tiles.querySelectorAll('.tile').forEach((t) => t.classList.toggle('is-active', t.dataset.mode === local.mode));
    el.countSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', +b.dataset.count === local.count));

    // Spieler-Zeilen
    const sig = s.slots.map((p) => `${p.id}:${p.color}`).join('|');
    if (sig !== ui.rowsSig) {
      ui.rowsSig = sig;
      el.playerRows.replaceChildren();
      ui.rows = s.slots.map((p, i) => {
        const row = node('div', 'player-row');
        row.dataset.color = p.color;
        const btn = node('button', 'name-btn');
        btn.type = 'button';
        btn.dataset.id = p.id;
        btn.setAttribute('aria-label', `Name von Platz ${i + 1} ändern`);
        btn.innerHTML = `<i class="dot"></i><span class="slot">Platz ${i + 1}</span><span class="name"></span><span class="pencil" data-icon="pencil"></span>`;
        const live = node('div', 'live');
        row.append(btn, live);
        el.playerRows.append(row);
        fillIcons(row);
        return { row, name: btn.querySelector('.name'), btn, live };
      });
    }
    s.slots.forEach((p, i) => {
      const r = ui.rows[i];
      const active = i < local.count;
      r.row.classList.toggle('is-off', !active);
      r.btn.disabled = !active;
      r.name.textContent = local.names[p.id] || p.name;
      const w = p.power_w;
      r.live.classList.toggle('is-dead', w === null);
      r.live.classList.toggle('is-alive', w !== null && w >= 0.5);
      r.live.innerHTML = w === null ? '<span class="live-text">kein Signal</span>'
        : `<b>${U.fmtPower(w)}</b><span class="live-unit"> W</span>`;
    });

    // Ziel
    const mode = local.mode;
    const goal = local.goals[mode];
    el.goalTitle.textContent = mode === 'time' ? 'Zeitlimit' : 'Zielenergie';
    el.goalValue.textContent = U.goalText(mode, goal);
    if (ui.chipsMode !== mode) {
      ui.chipsMode = mode;
      el.goalChips.replaceChildren(...U.PRESETS[mode].map((v) => {
        const b = node('button', 'chip-btn');
        b.type = 'button';
        b.dataset.value = v;
        b.textContent = U.presetLabel(mode, v);
        return b;
      }));
    }
    el.goalChips.querySelectorAll('.chip-btn').forEach((b) => b.classList.toggle('is-active', +b.dataset.value === goal));
    el.goalEstimate.textContent = U.estimateText(mode, goal);
    const [lo, hi] = U.LIMITS[mode];
    el.goalHint.textContent = mode === 'time'
      ? `Zeitlimit von ${lo} s bis ${hi / 60} min`
      : `Zielenergie von ${U.fmtWh(lo)} bis ${hi} Wh`;

    // Rekord zur gewählten Einstellung (nur anzeigen, wenn der Server sie schon kennt)
    const inSync = s.mode === mode && s.goal === goal && !Object.keys(pending).length;
    el.setupRecord.textContent = !inSync ? ''
      : (recordText(s.record, mode) || 'Noch kein Rekord – jetzt ist deine Chance!');
    el.setupRecord.classList.toggle('has-record', inSync && !!s.record);
    el.start.textContent = 'Start';
  }

  // Zielwert: + / − mit Gedrückthalten
  let repeatTimer = null;
  function stepBy(dir) {
    sendSetup({ mode: local.mode, goal: U.stepGoal(local.mode, local.goals[local.mode], dir) });
  }
  function stopRepeat() { clearTimeout(repeatTimer); repeatTimer = null; }
  document.querySelectorAll('.step').forEach((b) => {
    const dir = +b.dataset.dir;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stepBy(dir);
      let delay = 450;
      const again = () => { stepBy(dir); delay = Math.max(70, delay * 0.8); repeatTimer = setTimeout(again, delay); };
      repeatTimer = setTimeout(again, delay);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stopRepeat));
    b.addEventListener('click', (e) => { if (e.detail === 0) stepBy(dir); });   // per Tastatur
  });

  el.tiles.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (t && t.dataset.mode !== local.mode) sendSetup({ mode: t.dataset.mode });
  });
  el.countSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && +b.dataset.count !== local.count) sendSetup({ count: +b.dataset.count });
  });
  el.goalChips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip-btn');
    if (b) sendSetup({ mode: local.mode, goal: +b.dataset.value });
  });

  const osk = new Osk(el.osk);
  el.playerRows.addEventListener('click', (e) => {
    const btn = e.target.closest('.name-btn');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    const idx = state.slots.findIndex((p) => p.id === id);
    osk.open({
      title: `Name für Platz ${idx + 1}`,
      value: local.names[id],
      max: 16,
      onDone: (name) => sendSetup({ names: { [id]: name } }),
    });
  });

  el.start.addEventListener('click', () => { el.start.blur(); startRace(); });

  // ---------------------------------------------------------------- Rennen
  const rv = { sig: '', lanes: [], cards: [], ghost: null, compare: null, chart: new PowerChart(el.chart, U.fmtClock) };

  function buildRace(s) {
    el.lanes.replaceChildren();
    el.cards.replaceChildren();
    rv.lanes = [];
    rv.cards = [];
    rv.compare = null;
    const rows = s.players.map((p) => ({ color: p.color, ghost: false }));
    if (s.ghost) rows.push({ color: 'ghost', ghost: true });
    el.lanes.style.gridTemplateRows = `var(--curb) ${'minmax(0, 1fr) var(--curb) '.repeat(rows.length)}`.trim();

    const curb = (row) => { const c = node('div', 'curb'); c.style.gridRow = row; return c; };
    el.lanes.append(curb(1));
    rows.forEach((r, i) => {
      const row = 2 * i + 2;
      const label = node('div', `lane-label${r.ghost ? ' is-ghost' : ''}`);
      label.dataset.color = r.color;
      label.append(node('i', 'dot'), node('span', 'lane-name'));
      const road = node('div', `road${r.ghost ? ' is-ghost' : ''}`);
      road.dataset.color = r.color;
      road.innerHTML = '<div class="rail"><div class="slider"><div class="car"></div></div></div><div class="finish"></div>';
      road.querySelector('.car').innerHTML = CAR_SVG;
      const pct = node('div', 'lane-pct');
      [label, road, pct].forEach((n) => { n.style.gridRow = row; });
      el.lanes.append(label, road, pct, curb(row + 1));
      rv.lanes.push({ name: label.querySelector('.lane-name'), road, pct });
    });

    s.players.forEach((p) => {
      const card = node('article', 'card');
      card.dataset.color = p.color;
      card.innerHTML = `
        <div class="rank"></div>
        <div class="card-head"><h3 class="card-name"></h3><span class="badge"></span></div>
        <div class="power"><span class="num"></span> <span class="unit">W</span></div>
        <div class="cap">Aktuelle Leistung</div>
        <div class="cap cap-energy">Aktuelle Gesamtenergie</div>
        <div class="energy"><span class="num"></span> <span class="unit">mWh</span></div>
        <div class="bar"><i class="bar-fill"></i></div>
        <div class="bar-caption"><span class="cap-pct"></span><span class="cap-stats"></span></div>`;
      el.cards.append(card);
      rv.cards.push({
        card,
        rank: card.querySelector('.rank'),
        name: card.querySelector('.card-name'),
        badge: card.querySelector('.badge'),
        power: card.querySelector('.power .num'),
        energy: card.querySelector('.energy .num'),
        fill: card.querySelector('.bar-fill'),
        capPct: card.querySelector('.cap-pct'),
        capStats: card.querySelector('.cap-stats'),
      });
    });

    if (s.players.length === 1) {
      const aside = node('aside', 'panel compare-panel');
      aside.innerHTML = '<h2 class="panel-title">Das entspricht</h2><div class="compare-list"></div><div class="footnote">Richtwerte für deine bisher erzeugte Energie</div>';
      el.cards.append(aside);
      rv.compare = aside.querySelector('.compare-list');
    }
  }

  const BADGE = {
    ready: 'Bereit', lead: 'Führt!', trail: 'Aufholen!', tie: 'Gleichauf!', winner: 'Sieger!',
    solo: 'Läuft!', done: 'Geschafft!', draw: 'Unentschieden',
  };
  const badgeText = (p) => (p.status === 'loser' ? `${p.rank}. Platz` : BADGE[p.status] || '');

  function headlineText(s) {
    const [first] = s.players;
    const solo = s.players.length === 1;
    if (s.state === 'countdown') return 'Achtung …';
    if (s.state === 'finished') {
      if (solo) return s.mode === 'time' ? 'Zeit abgelaufen!' : 'Ziel erreicht!';
      const w = s.players.find((p) => p.id === s.winner);
      return w ? `${w.name} gewinnt!` : 'Unentschieden!';
    }
    const endSprint = s.mode === 'time' ? s.remaining <= 10 : Math.max(...s.players.map((p) => p.progress)) >= 0.85;
    if (endSprint) return s.mode === 'time' ? 'Endspurt!' : 'Zielspurt!';
    const early = s.mode === 'time' ? s.elapsed < 8 : Math.max(...s.players.map((p) => p.progress)) < 0.25;
    if (early) return "Los geh's";
    if (solo) {
      if (s.ghost) return first.progress >= s.ghost.progress ? 'Vor dem Rekord!' : 'Hol den Rekord ein!';
      return 'Weiter so!';
    }
    const lead = s.players.find((p) => p.status === 'lead');
    return lead ? `${lead.name} führt!` : 'Kopf an Kopf!';
  }

  function capPctText(s, shown) {
    if (s.mode === 'energy') return `${shown} % von ${U.fmtWh(s.goal)} Wh`;
    return `${shown} % vom ${s.ref_kind === 'record' ? 'Rekord' : 'Richtwert'}`;
  }

  function renderNote(s) {
    let text;
    let kind = '';
    if (!s.has_data) {
      text = 'Keine Sensordaten';
      kind = 'warn';
    } else if (s.state === 'finished' && s.new_record) {
      text = 'Neuer Rekord!';
      kind = 'record';
    } else {
      text = recordText(s.record, s.mode) || 'Noch keine Messwerte';
    }
    el.note.textContent = text;
    el.note.className = `note ${kind}`.trim();
  }

  // Jede Ziffer in eigener Zelle (feste Breite, siehe CSS): nur geänderte Zeichen werden angefasst.
  function renderTime(text) {
    if (el.time.dataset.text === text) return;
    el.time.dataset.text = text;
    if (el.time.children.length !== text.length) {
      el.time.replaceChildren(...[...text].map(() => document.createElement('span')));
    }
    [...text].forEach((ch, i) => {
      const cell = el.time.children[i];
      cell.textContent = ch;
      cell.className = ch === ':' || ch === '.' ? 'sep' : 'dg';
    });
    el.time.setAttribute('aria-label', text);
  }

  function renderCompare(box, wh) {
    const items = U.compare(wh);
    if (box.children.length !== items.length) {
      box.replaceChildren(...items.map((c) => {
        const row = node('div', 'compare-item');
        row.innerHTML = `<span class="compare-icon" data-icon="${c.key}"></span><span class="compare-label">${c.label}<small>${c.hint}</small></span><b class="compare-value"></b>`;
        fillIcons(row);
        return row;
      }));
    }
    items.forEach((c, i) => { box.children[i].querySelector('.compare-value').textContent = c.text; });
  }

  function renderRace(s) {
    const sig = `${s.players.map((p) => `${p.id}:${p.color}`).join('|')}#${s.ghost ? 1 : 0}`;
    if (sig !== rv.sig) { rv.sig = sig; buildRace(s); }

    el.headline.textContent = headlineText(s);
    const finished = s.state === 'finished';

    // Zeitanzeige: im Zeit-Rennen läuft sie rückwärts
    if (s.mode === 'time') {
      el.timeCaption.textContent = 'Verbleibende Zeit';
      renderTime(U.fmtClock(finished ? 0 : Math.ceil(s.remaining - 1e-9)));
    } else {
      el.timeCaption.textContent = 'Rennzeit';
      renderTime(finished ? U.fmtClockTenths(s.elapsed) : U.fmtClock(s.elapsed));
    }

    let totalWh = 0;
    s.players.forEach((p, i) => {
      const lane = rv.lanes[i];
      const card = rv.cards[i];
      const ratio = s.mode === 'time' ? p.ratio : p.progress;
      const shown = s.mode === 'energy' && p.progress >= 1 ? 100 : Math.floor(ratio * 100 + 1e-9);
      lane.name.textContent = p.name;
      lane.pct.textContent = `${Math.min(shown, 999)} %`;
      lane.road.style.setProperty('--p', p.progress.toFixed(4));
      card.name.textContent = p.name;
      card.rank.textContent = s.players.length > 1 ? p.rank : '';
      card.badge.textContent = badgeText(p);
      card.power.textContent = U.fmtPower(p.power_w);
      card.energy.textContent = String(Math.round(p.energy_mwh));
      card.fill.style.setProperty('--p', p.progress.toFixed(4));
      card.capPct.textContent = capPctText(s, Math.min(shown, 999));
      card.capStats.textContent = p.peak_w > 0
        ? `${p.avg_w ? `Ø ${Math.round(p.avg_w)} W · ` : ''}max ${Math.round(p.peak_w)} W` : '';
      card.card.dataset.status = p.status;
      lane.road.classList.toggle('is-over', ratio > 1 && s.mode === 'time');
      totalWh += p.energy_mwh / 1000;
    });
    if (s.ghost) {
      const lane = rv.lanes[s.players.length];
      lane.name.textContent = s.ghost.name;
      lane.pct.textContent = `${Math.floor(s.ghost.progress * 100 + 1e-9)} %`;
      lane.road.style.setProperty('--p', s.ghost.progress.toFixed(4));
    }
    if (rv.compare) renderCompare(rv.compare, totalWh);
    renderNote(s);
    renderChart(s);
  }

  // ---------------------------------------------------------------- Leistungskurve
  async function syncHistory(s) {
    if (s.race_id !== hist.raceId) hist = { raceId: s.race_id, points: [] };
    if (s.history_len === hist.points.length) return;
    try {
      const h = await api.history(hist.points.length, hist.raceId);
      if (h.race_id !== hist.raceId) hist = { raceId: h.race_id, points: [] };
      hist.points = h.from === 0 ? h.points : hist.points.concat(h.points);
    } catch (err) {
      /* die Kurve ist nur Zugabe – beim nächsten Poll erneut versuchen */
    }
  }

  function renderChart(s) {
    const lastT = hist.points.length ? hist.points[hist.points.length - 1][0] : 0;
    const xMax = s.mode === 'time' ? s.goal : Math.max(30, Math.ceil((Math.max(lastT, s.elapsed) * 1.1) / 10) * 10);
    const series = s.players.map((p, i) => ({
      color: U.COLORS[p.color] || '#fff',
      points: hist.points.map((pt) => [pt[0], pt[i + 1] === undefined ? null : pt[i + 1]]),
    }));
    rv.chart.set(series, xMax);
    const legend = s.players.map((p) => `<span class="legend-item"><i style="background:${U.COLORS[p.color]}"></i>${p.name}</span>`).join('');
    if (el.legend.dataset.html !== legend) { el.legend.dataset.html = legend; el.legend.innerHTML = legend; }
  }

  // ---------------------------------------------------------------- Ergebnis
  let resultFor = null;

  function statBlock(p, s) {
    const winner = p.status === 'winner' || p.status === 'done';
    const b = node('div', `stat${winner ? ' is-winner' : ''}`);
    b.dataset.color = p.color;
    b.innerHTML = `<div class="stat-name"><i class="dot"></i><span></span></div>
      <div class="stat-value"><b>${Math.round(p.energy_mwh)}</b> mWh</div>
      <div class="stat-detail">${p.avg_w ? `Ø ${Math.round(p.avg_w)} W · ` : ''}Spitze ${Math.round(p.peak_w)} W</div>`;
    b.querySelector('.stat-name span').textContent = p.name;
    return b;
  }

  function fillResult(s) {
    const solo = s.players.length === 1;
    const winner = s.players.find((p) => p.id === s.winner) || (solo ? s.players[0] : null);
    el.resultTitle.textContent = headlineText(s);
    let sub;
    if (s.mode === 'energy') {
      sub = solo ? `${U.fmtWh(s.goal)} Wh in ${U.fmtClockTenths(s.elapsed)}` : `${winner.name} war nach ${U.fmtClockTenths(s.elapsed)} im Ziel`;
    } else {
      const top = s.players.slice().sort((a, b) => b.energy_mwh - a.energy_mwh)[0];
      sub = solo ? `${Math.round(top.energy_mwh)} mWh in ${U.fmtClock(s.goal)}`
        : (winner ? `${winner.name} erzeugte ${Math.round(winner.energy_mwh)} mWh in ${U.fmtClock(s.goal)}` : `Beide erzeugten ${Math.round(top.energy_mwh)} mWh`);
    }
    el.resultSub.textContent = sub;

    if (s.new_record) {
      el.resultRibbon.hidden = false;
      el.resultRibbon.className = 'ribbon is-record';
      el.resultRibbon.textContent = 'Neuer Rekord!';
    } else if (s.record) {
      el.resultRibbon.hidden = false;
      el.resultRibbon.className = 'ribbon';
      el.resultRibbon.textContent = recordText(s.record, s.mode);
    } else {
      el.resultRibbon.hidden = true;
    }

    el.resultStats.replaceChildren(...s.players.map((p) => statBlock(p, s)));
    el.resultStats.dataset.count = s.players.length;
    const wh = s.players.reduce((sum, p) => sum + p.energy_mwh, 0) / 1000;
    const compareHtml = U.compare(wh).map((c) => `<div class="compare-chip"><span class="compare-icon" data-icon="${c.key}"></span><b>${c.text}</b><small>${c.label}</small></div>`).join('');
    el.resultCompare.innerHTML = `<div class="compare-title">${solo ? 'Das entspricht deiner Energie' : 'Zusammen erzeugt – das entspricht'}</div>${compareHtml}`;
    fillIcons(el.resultCompare);
  }

  function renderResult(s) {
    const show = s.state === 'finished' && Date.now() - finishedAt >= RESULT_DELAY_MS;
    if (show && resultFor !== s.race_id) { resultFor = s.race_id; fillResult(s); }
    if (el.result.hidden === show) {
      el.result.hidden = !show;
      if (show) setTimeout(() => el.again.focus({ preventScroll: true }), 50);
    }
  }

  // ---------------------------------------------------------------- Overlay (Countdown / LOS!)
  function renderOverlay(s) {
    let text = null;
    let kind = '';
    if (s.state === 'countdown') {
      text = String(s.countdown);
    } else if (s.state === 'running' && s.elapsed < GO_FLASH_S) {
      text = 'LOS!';
      kind = 'go';
    }
    if (text === null) {
      el.overlay.hidden = true;
      el.overlay.replaceChildren();
      delete el.overlay.dataset.text;
      return;
    }
    el.overlay.hidden = false;
    if (el.overlay.dataset.text !== text) {   // neues Element -> Animation startet neu
      el.overlay.dataset.text = text;
      el.overlay.replaceChildren(node('span', `count ${kind}`, text));
    }
  }

  // ---------------------------------------------------------------- Übergänge (Töne, Konfetti)
  function effects(s) {
    if (prev) {
      if (s.state === 'countdown' && s.countdown !== lastCountdown) Sound.tick();
      if (prev.state === 'countdown' && s.state === 'running') Sound.go();
      if (prev.state === 'running' && s.state === 'finished') {
        finishedAt = Date.now();
        const w = s.players.find((p) => p.id === s.winner) || s.players[0];
        Confetti.burst([U.COLORS[w.color] || '#fff']);
        Sound.finish();
        if (s.new_record) Sound.record();
      }
    } else if (s.state === 'finished') {
      finishedAt = 0;   // Seite wurde erst nach dem Ziel geöffnet: Ergebnis sofort zeigen
    }
    if (s.state !== 'finished') Confetti.stop();
    lastCountdown = s.state === 'countdown' ? s.countdown : null;
    prev = s;
  }

  // ---------------------------------------------------------------- Hauptschleife
  function render(s) {
    state = s;
    syncLocal(s);
    el.body.dataset.state = s.state;
    el.body.dataset.view = s.state === 'idle' ? 'setup' : 'race';
    renderHeader(s);
    if (s.state === 'idle') renderSetup(s);
    else renderRace(s);
    effects(s);
    renderResult(s);
    renderOverlay(s);
  }

  let failures = 0;
  let pollTimer = null;
  let polling = false;

  async function poll() {
    if (polling) return;
    polling = true;
    clearTimeout(pollTimer);
    try {
      const s = await api.getState();
      failures = 0;
      everConnected = true;
      el.offline.hidden = true;
      await syncHistory(s);
      render(s);
    } catch (err) {
      if (err.noBackend && !everConnected && api.kind === 'server') {
        // Keine API da (z. B. statisch geöffnet): die Oberfläche läuft stattdessen im Demo-Modus
        api = new DemoApi({ speed: demoSpeed });
      } else if (++failures >= 3) {
        el.offline.hidden = false;
      }
    } finally {
      polling = false;
      pollTimer = setTimeout(poll, POLL_MS);
    }
  }

  // ---------------------------------------------------------------- Bedienung
  // "Abbrechen" in der Kopfzeile: gedrückt halten, damit niemand das Rennen versehentlich beendet.
  let holdTimer = null;
  let holdFired = false;
  function cancelHold() { clearTimeout(holdTimer); holdTimer = null; el.abort.classList.remove('holding'); }
  el.abort.addEventListener('pointerdown', () => {
    holdFired = false;
    el.abort.classList.add('holding');
    holdTimer = setTimeout(() => { cancelHold(); holdFired = true; command('/api/reset'); }, HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.abort.addEventListener(ev, cancelHold));
  el.abort.addEventListener('click', () => {
    el.abort.blur();
    if (holdFired) holdFired = false;
    else toast('Zum Abbrechen gedrückt halten');
  });

  el.again.addEventListener('click', () => { el.again.blur(); startRace(); });
  el.againNew.addEventListener('click', () => { el.againNew.blur(); command('/api/reset'); });

  function paintSound() { el.sound.innerHTML = Sound.muted ? ICONS.soundOff : ICONS.soundOn; el.sound.setAttribute('aria-pressed', String(Sound.muted)); }
  el.sound.addEventListener('click', () => { Sound.toggle(); paintSound(); el.sound.blur(); });
  paintSound();
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  document.addEventListener('keydown', (e) => {
    if (osk.handleKey(e)) return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !state) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (state.state === 'idle') { e.preventDefault(); startRace(); }
      else if (state.state === 'finished') { e.preventDefault(); startRace(); }
    } else if (e.key === 'Escape') {
      if (state.state === 'finished') command('/api/reset');
    } else if (e.key === 'r' || e.key === 'R') {
      command('/api/reset');
    } else if (e.key === 'm' || e.key === 'M') {
      Sound.toggle(); paintSound();
    } else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });

  // Kiosk/Touch: langes Drücken soll kein Kontextmenü öffnen
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Mauszeiger ausblenden, wenn er nicht bewegt wird (Kiosk-Betrieb)
  let cursorTimer = null;
  const hideCursorLater = () => {
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.documentElement.classList.add('idle-cursor'), 3000);
  };
  document.addEventListener('pointermove', () => { document.documentElement.classList.remove('idle-cursor'); hideCursorLater(); });
  hideCursorLater();

  poll();
})();
