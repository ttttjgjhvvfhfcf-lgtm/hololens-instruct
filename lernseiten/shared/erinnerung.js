/* Lernportal – Erinnerung an die nächste Lernzielkontrolle in der Menüzeile (Portal, Stundenplan, Schularbeiten).
   Gebraucht wird ein <a id="erinn" hidden></a> in der Menüzeile; shared/stundenplan.js und shared/live.js müssen davor geladen sein.
   Die Pille zeigt die nächste Kontrolle, wird hervorgehoben, wenn sie heute oder morgen ist, und führt zur Zusammenfassung.
   Mit ?zeit=2026-11-24T18:00 an der Adresse lässt sich ein anderer Zeitpunkt ausprobieren (wie bei der Live-Anzeige). */
(function () {
  'use strict';
  var el = document.getElementById('erinn'), P = window.STUNDENPLAN, L = window.LernLive;
  if (!el || !P || !L || !P.lernzielkontrollen || !P.lernzielkontrollen.length) return;

  var css =
    '.erinn{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:.6rem;align-items:center;min-width:0;max-width:100%;text-decoration:none;color:#fff;' +
      'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:.4rem .85rem}' +
    '.erinn:hover{background:rgba(255,255,255,.2)}.erinn[hidden]{display:none!important}' +
    '.erinn svg{grid-row:1 / span 2;width:1.05rem;height:1.05rem;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.85}' +
    '.erinn-main{font:700 .88rem/1.25 var(--font,system-ui,sans-serif);overflow-wrap:anywhere}' +
    '.erinn-sub{font:500 .76rem/1.25 var(--font,system-ui,sans-serif);opacity:.85;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}' +
    '.erinn.bald{background:rgba(251,191,36,.2);border-color:rgba(251,191,36,.62)}.erinn.bald svg{color:#fbbf24;opacity:1}' +
    '.topnav>.erinn{margin-left:auto}' +
    '@media (max-width:600px){.topnav>.erinn,.pills .erinn{margin-left:0;width:100%}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  el.innerHTML = BELL + '<span class="erinn-main"></span><span class="erinn-sub"></span>';
  var main = el.querySelector('.erinn-main'), sub = el.querySelector('.erinn-sub');

  function render() {
    var e = L.lernzielkontrollen(P, L.jetzt(), 1)[0];
    if (!e) { el.hidden = true; return; }
    var t = L.lzkText(e);
    main.textContent = t.haupt;
    sub.textContent = t.neben;
    el.classList.toggle('bald', t.bald);
    el.href = e.seite || 'stundenplan.html';
    el.title = e.name + ' ' + e.fach + (e.seite ? ': Zusammenfassung und Beispielaufgaben öffnen' : '') + (L.simuliert() ? ' (Testzeit)' : '');
    el.hidden = false;
  }
  render();
  setInterval(render, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
})();
