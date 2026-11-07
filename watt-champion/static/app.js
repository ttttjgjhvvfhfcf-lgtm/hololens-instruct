(() => {
  'use strict';

  const POLL_MS = 200;       // wie oft der Zustand beim Server abgefragt wird
  const HOLD_MS = 1000;      // so lange muss "Abbrechen" gehalten werden
  const GO_FLASH_S = 0.9;    // so lange wird nach dem Start "LOS!" gezeigt

  const $ = (sel) => document.querySelector(sel);
  const el = {
    logo: $('#logo'), goal: $('#goal'), sponsor: $('#sponsor'), simchip: $('#simchip'),
    headline: $('#headline'), lanes: $('#lanes'), cards: $('#cards'),
    time: $('#time'), note: $('#note'), action: $('#action'), hint: $('#hint'),
    overlay: $('#overlay'), offline: $('#offline'),
  };
  const actionText = el.action.querySelector('.btn-text');

  // ---------------------------------------------------------------- Texte
  const BADGE = {
    ready: 'Bereit', lead: 'Führt!', trail: 'Aufholen!', tie: 'Gleichauf!', winner: 'Sieger!',
  };

  function badgeText(p) {
    return p.status === 'loser' ? `${p.rank}. Platz` : (BADGE[p.status] || '');
  }

  function headlineText(s) {
    const players = s.players;
    switch (s.state) {
      case 'idle': return 'Bereit zum Start';
      case 'countdown': return 'Achtung …';
      case 'finished': {
        const w = players.find((p) => p.id === s.winner);
        return w ? `${w.name} gewinnt!` : 'Ziel erreicht';
      }
      default: {
        const top = Math.max(...players.map((p) => p.progress));
        if (top >= 0.85) return 'Zielspurt!';
        if (top < 0.25) return "Los geh's";
        const lead = players.find((p) => p.status === 'lead');
        return lead ? `${lead.name} führt!` : 'Kopf an Kopf!';
      }
    }
  }

  // ---------------------------------------------------------------- Formatierung
  const pad2 = (n) => String(n).padStart(2, '0');

  function fmtTime(seconds, tenths = false) {
    const whole = Math.floor(seconds);
    const base = `${pad2(Math.floor(whole / 60))}:${pad2(whole % 60)}`;
    return tenths ? `${base}.${Math.floor((seconds - whole) * 10)}` : base;
  }

  function fmtPower(w) {
    if (w == null) return '–';
    return w < 10 ? w.toFixed(1) : String(Math.round(w));
  }

  const fmtTarget = (wh) => `${Number.isInteger(wh) ? wh.toFixed(1) : String(wh)} Wh`;

  // ---------------------------------------------------------------- Aufbau
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

  const ui = { ids: '', players: [] };

  function node(tag, className, html) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function buildPlayers(players) {
    el.lanes.replaceChildren();
    el.cards.replaceChildren();
    ui.players = [];
    const n = players.length;
    document.documentElement.style.setProperty('--n', n);
    el.lanes.style.gridTemplateRows =
      'var(--curb) ' + 'minmax(0, 1fr) var(--curb) '.repeat(n).trim();

    const curb = (row) => {
      const c = node('div', 'curb');
      c.style.gridRow = row;
      return c;
    };
    el.lanes.append(curb(1));
    players.forEach((p, i) => {
      const row = 2 * i + 2;   // Zeilen: Randstein, Spur, Randstein, Spur, ... Randstein
      const label = node('div', 'lane-label');
      label.dataset.color = p.color;
      label.append(node('i', 'dot'), node('span', 'lane-name'));
      const road = node('div', 'road');
      road.innerHTML = '<div class="rail"><div class="slider"><div class="car"></div></div></div><div class="finish"></div>';
      road.querySelector('.car').innerHTML = CAR_SVG;
      road.dataset.color = p.color;
      const pct = node('div', 'lane-pct');
      [label, road, pct].forEach((n) => { n.style.gridRow = row; });
      el.lanes.append(label, road, pct, curb(row + 1));

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
        <div class="cap cap-pct"></div>`;
      el.cards.append(card);

      ui.players.push({
        laneName: label.querySelector('.lane-name'),
        road, pct,
        card,
        rank: card.querySelector('.rank'),
        name: card.querySelector('.card-name'),
        badge: card.querySelector('.badge'),
        power: card.querySelector('.power .num'),
        energy: card.querySelector('.energy .num'),
        fill: card.querySelector('.bar-fill'),
        capPct: card.querySelector('.cap-pct'),
      });
    });
  }

  function applyConfig(cfg, s) {
    const words = (cfg.title || 'watt champion').trim().split(/\s+/);
    el.logo.replaceChildren(node('span', null, words[0]),
      ...(words.length > 1 ? [node('span', null, words.slice(1).join(' '))] : []));
    document.title = cfg.title || 'watt champion';
    el.simchip.hidden = cfg.sensor !== 'sim';
    if (cfg.sponsor_logo) {
      if (el.sponsor.getAttribute('src') !== cfg.sponsor_logo) el.sponsor.src = cfg.sponsor_logo;
      el.sponsor.hidden = false;
    } else {
      el.sponsor.hidden = true;
    }
    el.goal.textContent = fmtTarget(s.target_wh);
  }

  // ---------------------------------------------------------------- Anzeigen
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
      return;
    }
    el.overlay.hidden = false;
    if (el.overlay.dataset.text !== text) {   // neues Element -> Animation startet neu
      el.overlay.dataset.text = text;
      el.overlay.replaceChildren(node('span', `count ${kind}`, text));
    }
  }

  // Jede Ziffer in eigener Zelle (feste Breite, siehe CSS), nur geänderte Zeichen werden angefasst.
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

  function renderNote(s) {
    let text;
    let kind = '';
    const rec = s.record;
    if (!s.has_data) {
      text = 'Keine Sensordaten';
      kind = 'warn';
    } else if (s.state === 'finished' && s.new_record) {
      text = 'Neuer Rekord!';
      kind = 'record';
    } else if (rec) {
      text = `Rekord: ${fmtTime(rec.seconds)} · ${rec.name}`;
    } else {
      text = 'Noch keine Messwerte';
    }
    el.note.textContent = text;
    el.note.className = `note ${kind}`.trim();
  }

  let actionMode = 'start';

  function renderAction(s) {
    if (s.state === 'idle') {
      actionMode = 'start';
      actionText.textContent = 'Start';
      el.hint.textContent = '';
    } else if (s.state === 'finished') {
      actionMode = 'reset';
      actionText.textContent = 'Neues Rennen';
      el.hint.textContent = '';
    } else {
      actionMode = 'abort';
      actionText.textContent = 'Abbrechen';
      el.hint.textContent = 'Gedrückt halten';
    }
    el.action.dataset.mode = actionMode;
  }

  function render(s) {
    document.body.dataset.state = s.state;
    const sig = s.players.map((p) => `${p.id}:${p.color}:${p.name}`).join('|');
    if (sig !== ui.ids) {
      ui.ids = sig;
      buildPlayers(s.players);
    }
    applyConfig(s.config || {}, s);
    el.headline.textContent = headlineText(s);
    renderTime(fmtTime(s.elapsed, s.state === 'finished'));

    s.players.forEach((p, i) => {
      const v = ui.players[i];
      const shown = p.progress >= 1 ? 100 : Math.min(99, Math.floor(p.progress * 100));
      v.laneName.textContent = p.name;
      v.pct.textContent = `${shown} %`;
      v.road.style.setProperty('--p', p.progress.toFixed(4));
      v.name.textContent = p.name;
      v.rank.textContent = p.rank;
      v.badge.textContent = badgeText(p);
      v.power.textContent = fmtPower(p.power_w);
      v.energy.textContent = String(Math.round(p.energy_mwh));
      v.fill.style.setProperty('--p', p.progress.toFixed(4));
      v.capPct.textContent = `${shown} % von ${fmtTarget(s.target_wh)}`;
      v.card.dataset.status = p.status;
    });

    renderNote(s);
    renderAction(s);
    renderOverlay(s);
  }

  // ---------------------------------------------------------------- Server
  async function post(path) {
    try {
      await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (err) {
      /* Der nächste Poll zeigt den Verbindungsfehler an. */
    }
    poll(true);
  }

  let failures = 0;
  let pollTimer = null;

  async function poll(immediate) {
    clearTimeout(pollTimer);
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch('/api/state', { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error(res.status);
      render(await res.json());
      failures = 0;
      el.offline.hidden = true;
    } catch (err) {
      if (++failures >= 3) el.offline.hidden = false;
    } finally {
      clearTimeout(timeout);
      pollTimer = setTimeout(poll, POLL_MS);
    }
  }

  // ---------------------------------------------------------------- Bedienung
  let holdTimer = null;
  let holdFired = false;   // der Abbruch wurde durch Halten ausgelöst
  let pressMode = null;    // Modus des Buttons beim Herunterdrücken

  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
    el.action.classList.remove('holding');
  }

  el.action.addEventListener('pointerdown', () => {
    pressMode = actionMode;
    holdFired = false;
    if (actionMode !== 'abort') return;
    el.action.classList.add('holding');
    holdTimer = setTimeout(() => { cancelHold(); holdFired = true; post('/api/reset'); }, HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.action.addEventListener(ev, cancelHold));

  // Beim Loslassen feuert der Browser ein "click". Das darf nach einem Halten-zum-Abbrechen
  // (der Button wird danach sofort zu "Start") nicht gleich ein neues Rennen starten – und
  // ebenso wenig das Ergebnis wegwischen, wenn das Rennen genau während des Drückens endet.
  el.action.addEventListener('click', () => {
    const mode = pressMode ?? actionMode;   // per Tastatur gibt es kein pointerdown
    pressMode = null;
    const swallowed = holdFired || mode !== actionMode;
    holdFired = false;
    el.action.blur();   // damit Leertaste/Enter nicht doppelt ausgelöst werden
    if (swallowed) return;
    if (actionMode === 'start') post('/api/start');
    else if (actionMode === 'reset') post('/api/reset');
  });

  // Kiosk/Touch: langes Drücken (Abbrechen halten) soll kein Kontextmenü öffnen
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (actionMode === 'start') post('/api/start');
      else if (actionMode === 'reset') post('/api/reset');
    } else if (e.key === 'r' || e.key === 'R') {
      post('/api/reset');
    } else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });

  // Mauszeiger ausblenden, wenn er nicht bewegt wird (Kiosk-Betrieb)
  let cursorTimer = null;
  document.addEventListener('pointermove', () => {
    document.documentElement.classList.remove('idle-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.documentElement.classList.add('idle-cursor'), 3000);
  });
  cursorTimer = setTimeout(() => document.documentElement.classList.add('idle-cursor'), 3000);

  poll();
})();
