/* Lernportal – gemeinsames Skript für alle Fachseiten (am Ende von <body> eingebunden).
   1) Hell/Dunkel wie im Portal            2) Link zurück zur Übersicht
   3) Sprung zum Suchtreffer + Blättern    4) Platzhalter für fehlende Bilder
   5) breite Tabellen scrollbar machen     6) weitere Seiten desselben Fachs am Seitenende */
(function () {
  'use strict';
  var doc = document, body = doc.body, me = doc.currentScript;
  var SHARED = me && me.src ? me.src.replace(/hub\.js(?:[?#].*)?$/, '') : '../../shared/';
  var HOME = SHARED + '../index.html';

  var norm = function (s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  var debounce = function (fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; };
  var contentRoot = function () { return doc.querySelector('main') || doc.querySelector('.toc-main') || body; };

  // Stylesheet nachladen, falls die Seite es (noch) nicht selbst einbindet
  if (!doc.querySelector('link[href*="hub.css"]')) {
    var css = doc.createElement('link');
    css.rel = 'stylesheet'; css.href = SHARED + 'hub.css';
    doc.head.appendChild(css);
  }

  /* ── 1) Hell/Dunkel ──────────────────────────────────────────────────────
     Reihenfolge: ausdrückliche Wahl (im Portal oder auf einer Seite) > Zustand des Portals
     beim Öffnen dieser Seite > eigene Voreinstellung der Seite. Umgeschaltet wird über den
     eigenen Knopf der Seite, damit deren Beschriftung und Speicherung stimmen. */
  var syncing = false;
  var isDark = function () { return body.classList.contains('dark'); };
  function wantedTheme() {
    var t = null;
    try { t = JSON.parse(localStorage.getItem('lern-theme')); } catch (e) {}
    if (t !== 'dark' && t !== 'light') { try { t = sessionStorage.getItem('lern-theme-now'); } catch (e) {} }
    return t === 'dark' || t === 'light' ? t : null;
  }
  function syncTheme() {
    var t = wantedTheme();
    if (!t || (t === 'dark') === isDark()) return;
    var btn = doc.getElementById('dm-toggle');
    syncing = true;
    if (btn) btn.click(); else body.classList.toggle('dark', t === 'dark');
    syncing = false;
  }
  syncTheme();
  var dm = doc.getElementById('dm-toggle');
  if (dm) dm.addEventListener('click', function () {
    if (syncing) return;
    setTimeout(function () {
      var t = isDark() ? 'dark' : 'light';
      try { localStorage.setItem('lern-theme', JSON.stringify(t)); } catch (e) {}
      try { sessionStorage.setItem('lern-theme-now', t); } catch (e) {}
    }, 0);
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) syncTheme(); });

  /* ── 2) Zurück zur Übersicht ─────────────────────────────────────────── */
  function addBackLink() {
    if (doc.getElementById('hub-back')) return;
    var a = doc.createElement('a');
    a.id = 'hub-back'; a.href = HOME; a.title = 'Zurück zur Übersicht aller Fächer';
    a.textContent = '← Alle Fächer';
    var bar = doc.querySelector('.formula-nav, .toolbar, nav:not(.toc-sidebar)');
    if (bar) bar.insertBefore(a, bar.firstChild);
    else { a.className = 'hub-float'; body.appendChild(a); }
  }

  /* ── 3) Sprung zum Suchtreffer ───────────────────────────────────────── */
  var SKIP = '#exam-modal,#exam-overlay,[id*="modal"],[class*="overlay"],nav,aside,header,script,style,.katex,mjx-container,.toc-sidebar,[id^="hub-"]';
  var HEADS = 'h2,h3,h4,.sum-title,.aufgabe-title,.card-title,.textbook-head,.section-title,.card-head';
  var BOX = '.sum-wrap, .aufgabe, .section, .card';

  function readJump() {
    var j = null;
    try {
      var h = decodeURIComponent(location.hash.slice(1));
      if (h.indexOf('hub:') === 0) j = JSON.parse(h.slice(4));
    } catch (e) {}
    if (!j) {
      try {
        var s = JSON.parse(sessionStorage.getItem('lern-jump') || 'null');
        if (s && Date.now() - s.ts < 15000 && decodeURIComponent(location.pathname).slice(-s.p.length) === s.p) j = s;
      } catch (e) {}
    }
    try { sessionStorage.removeItem('lern-jump'); } catch (e) {}
    return j;
  }

  // Eingeklappte Abschnitte und <details> rund um ein Element öffnen
  function reveal(el) {
    var c = el.closest('.collapsed');
    while (c) { c.classList.remove('collapsed'); c = c.parentElement && c.parentElement.closest('.collapsed'); }
    var d = el.closest('details:not([open])');
    while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details:not([open])'); }
  }

  function highlight(root, words) {
    var re;
    try { re = new RegExp('(' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi'); } catch (e) { return []; }
    var tw = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SKIP))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n, marks = [];
    while ((n = tw.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var txt = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(txt)) return;
      var frag = doc.createDocumentFragment();
      txt.split(re).forEach(function (part, i) {
        if (i % 2) {
          var m = doc.createElement('mark');
          m.className = 'hub-hit'; m.textContent = part;
          frag.appendChild(m); marks.push(m);
        } else if (part) frag.appendChild(doc.createTextNode(part));
      });
      node.parentNode.replaceChild(frag, node);
    });
    return marks;
  }

  // Kleine Leiste zum Blättern durch die Treffer und zum Entfernen der Markierungen
  function finder(marks, q, start, onMark) {
    var i = onMark ? start : null;
    var bar = doc.createElement('div');
    bar.id = 'hub-find'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Suchtreffer auf dieser Seite');
    bar.innerHTML = '<span class="hub-find-q"></span><span class="hub-find-n" aria-live="polite"></span>' +
      (marks.length > 1 ? '<button type="button" data-d="-1" title="Vorheriger Treffer" aria-label="Vorheriger Treffer">↑</button>' +
        '<button type="button" data-d="1" title="Nächster Treffer" aria-label="Nächster Treffer">↓</button>' : '') +
      '<button type="button" data-x="1" title="Markierungen entfernen" aria-label="Markierungen entfernen">✕</button>';
    bar.querySelector('.hub-find-q').textContent = '„' + q + '“';
    var count = bar.querySelector('.hub-find-n');
    function show(scroll) {
      marks.forEach(function (m) { m.classList.remove('hub-cur'); });
      if (i === null) { count.textContent = marks.length + ' Treffer'; return; }
      var m = marks[i];
      m.classList.add('hub-cur'); reveal(m);
      count.textContent = (i + 1) + ' / ' + marks.length;
      if (scroll) m.scrollIntoView({ block: 'center' });
    }
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.x) {
        marks.forEach(function (m) { var p = m.parentNode; if (p) { p.replaceChild(doc.createTextNode(m.textContent), m); p.normalize(); } });
        bar.remove(); return;
      }
      var d = +b.dataset.d, n = marks.length;
      i = i === null ? (d > 0 ? start : (start - 1 + n) % n) : (i + d + n) % n;
      show(true);
    });
    body.appendChild(bar);
    show(false);
  }

  function jump(j) {
    var root = contentRoot(), target = null;
    var find = function (scope, text) {
      var want = norm(text), hs = scope.querySelectorAll(HEADS);
      for (var i = 0; i < hs.length; i++) if (!hs[i].closest(SKIP) && norm(hs[i].textContent) === want) return hs[i];
      return null;
    };
    if (j.at) {
      var par = j.k ? find(root, j.k) : null;
      var parBox = par && par.closest(BOX);
      target = (parBox && find(parBox, j.at)) || find(root, j.at);
    }
    var words = (j.q || '').split(/\s+/).filter(function (w) { return w.length > 1; });
    var marks = words.length ? highlight(root, words) : [];
    // Blättern beginnt beim ersten Treffer im angesprungenen Abschnitt
    var start = 0, box = target && (target.closest(BOX) || null);
    if (box) for (var i = 0; i < marks.length; i++) if (box.contains(marks[i])) { start = i; break; }
    var el = target || marks[0];
    if (!el) return;
    reveal(el);
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
    window.scrollBy({ top: -80, behavior: 'instant' });
    if (target) { target.classList.add('hub-target'); setTimeout(function () { target.classList.remove('hub-target'); }, 2600); }
    if (marks.length) finder(marks, (j.q || '').trim(), start, !target);
  }

  /* ── 4) Fehlende Bilder ──────────────────────────────────────────────── */
  function fixImages() {
    doc.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src');
      if (!src || img.closest('[id^="hub-"]')) return;
      var bad = function () {
        if (img.dataset.hubNoimg) return;
        img.dataset.hubNoimg = '1';
        var name = src.split('/').pop();
        try { name = decodeURIComponent(name); } catch (e) {}
        var ph = doc.createElement('div');
        ph.className = 'hub-noimg';
        ph.innerHTML = '<b>Bild fehlt</b>' + (img.alt ? '<span>' + esc(img.alt) + '</span>' : '') + '<code>' + esc(name) + '</code>';
        img.parentNode.insertBefore(ph, img);
        img.style.display = 'none';
      };
      if (img.complete) { if (!img.naturalWidth) bad(); }
      else img.addEventListener('error', bad);
    });
  }

  /* ── 5) Breite Tabellen ──────────────────────────────────────────────── */
  // Zeigt über .hub-l / .hub-r an, auf welcher Seite noch Inhalt liegt
  function edges(sc) {
    var sw = sc.parentNode, max = sc.scrollWidth - sc.clientWidth;
    sw.classList.toggle('hub-l', sc.scrollLeft > 2);
    sw.classList.toggle('hub-r', max - sc.scrollLeft > 2);
  }
  // Mehrspaltige Tabellen nicht auf Wortbreite zusammenquetschen: lieber etwas breiter machen und seitlich wischen lassen
  function widen(sc) {
    var t = sc.querySelector('table');
    if (!t || !t.rows.length || t.style.minWidth) return;
    var n = t.rows[0].cells.length;
    if (n >= 4) t.style.minWidth = Math.min(n * 8.5, 42) + 'rem';
    // Kurze Werte wie „300/300 V“ oder „H05VV-F“ nie umbrechen, nur lange Texte
    if (n >= 3) t.querySelectorAll('td, th').forEach(function (c) { if (c.textContent.trim().length <= 14) c.classList.add('hub-nw'); });
  }
  // Macht einen bestehenden Scroll-Container zum Träger des Randschattens
  function upgrade(sc) {
    widen(sc);
    if (sc.parentNode.classList.contains('hub-sw')) return;
    var sw = doc.createElement('div');
    sw.className = 'hub-sw';
    sc.parentNode.insertBefore(sw, sc); sw.appendChild(sc);
    sc.classList.add('hub-scroll');
    sc.addEventListener('scroll', function () { edges(sc); }, { passive: true });
  }
  function wrapWide() {
    var root = contentRoot();
    // Seiten mit eigener Tabellenhülle (selbst erzeugte Lernseiten)
    root.querySelectorAll('.tbl-wrap').forEach(upgrade);
    root.querySelectorAll('table').forEach(function (t) {
      var p = t.parentElement;
      if (!p || !t.offsetWidth || t.closest(SKIP) || t.closest('.hub-scroll')) return;
      for (var a = p; a && a !== body; a = a.parentElement) {
        var o = getComputedStyle(a).overflowX;
        if (o === 'auto' || o === 'scroll') return;   // scrollt schon in sich
      }
      if (t.offsetWidth > p.clientWidth + 1) {
        var sc = doc.createElement('div');
        p.insertBefore(sc, t); sc.appendChild(t);
        upgrade(sc);
      }
    });
    doc.querySelectorAll('.hub-scroll').forEach(edges);
  }

  /* Werkzeugleisten, die auf dem Handy seitlich wischen: Rand ausblenden, solange rechts noch etwas liegt */
  function navHint() {
    var bars = doc.querySelectorAll('body > nav:not(.toc-sidebar)');
    bars.forEach(function (nav) {
      var upd = function () { nav.classList.toggle('hub-navmore', nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 6); };
      if (!nav.dataset.hubNav) { nav.dataset.hubNav = '1'; nav.addEventListener('scroll', upd, { passive: true }); }
      upd();
    });
  }

  /* ── 6) Weitere Seiten im selben Fach ────────────────────────────────── */
  function related(map) {
    if (doc.getElementById('hub-rel')) return;
    var path = location.pathname, fach = null, hier = null;
    try { path = decodeURIComponent(path); } catch (e) {}
    (map.faecher || []).forEach(function (f) {
      f.seiten.forEach(function (s) { if (path.slice(-s.datei.length) === s.datei) { fach = f; hier = s; } });
    });
    if (!fach) return;
    var andere = fach.seiten.filter(function (s) { return s !== hier; });
    andere.sort(function (a, b) { return (b.jahr === hier.jahr) - (a.jahr === hier.jahr) || b.jahr - a.jahr; });
    var el = doc.createElement('aside');
    el.id = 'hub-rel';
    var html = '<div class="hub-rel-box">';
    if (andere.length) {
      html += '<p class="hub-rel-title">Mehr in ' + esc(fach.name) + '</p><div class="hub-rel-list">' + andere.map(function (s) {
        return '<a href="' + esc(SHARED + '../' + s.datei) + '"><b>' + esc(s.titel) + '</b><small>' + esc(s.art) +
          (s.jahr !== hier.jahr ? ' · ' + s.jahr + '. Jahr' : '') + '</small></a>';
      }).join('') + '</div>';
    }
    html += '<a class="hub-rel-home" href="' + esc(HOME) + '">← Alle Fächer im Lernportal</a></div>';
    el.innerHTML = html;
    var main = doc.querySelector('main'), tm = doc.querySelector('.toc-main');
    if (main) main.insertAdjacentElement('afterend', el);
    else if (tm) tm.appendChild(el);
    else body.appendChild(el);
  }
  function loadMap() {
    if (window.LERN_SEITEN) return related(window.LERN_SEITEN);
    var s = doc.createElement('script');
    s.src = SHARED + 'seiten.js';
    s.onload = function () { if (window.LERN_SEITEN) related(window.LERN_SEITEN); };
    doc.head.appendChild(s);
  }

  /* ── 7) Aktiven Abschnitt in der Sprungleiste markieren ──────────────── */
  function spy() {
    var links = [].slice.call(doc.querySelectorAll('.nav-jump a[href^="#"]'));
    if (!links.length) return;
    var items = links.map(function (a) {
      var id = a.getAttribute('href').slice(1);
      try { id = decodeURIComponent(id); } catch (e) {}
      return { a: a, el: doc.getElementById(id) };
    }).filter(function (x) { return x.el; });
    if (!items.length) return;
    var nav = links[0].closest('nav'), busy = false, last = null;
    function upd() {
      busy = false;
      var cur = null;
      items.forEach(function (x) { if (x.el.getBoundingClientRect().top <= 140) cur = x; });
      if (cur === last) return;
      last = cur;
      links.forEach(function (a) { a.classList.remove('hub-on'); a.removeAttribute('aria-current'); });
      if (!cur) return;
      cur.a.classList.add('hub-on'); cur.a.setAttribute('aria-current', 'location');
      // Auf dem Handy wischt die Leiste: aktiven Eintrag ins Bild holen
      if (nav && nav.scrollWidth > nav.clientWidth + 4) {
        var a = cur.a.getBoundingClientRect(), n = nav.getBoundingClientRect();
        if (a.left < n.left + 90 || a.right > n.right - 40) nav.scrollTo({ left: nav.scrollLeft + a.left - n.left - 110, behavior: 'smooth' });
      }
    }
    window.addEventListener('scroll', function () { if (!busy) { busy = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  /* ── Start ───────────────────────────────────────────────────────────── */
  addBackLink();
  loadMap();
  function ready() {
    syncTheme();   // manche Seiten binden ihren Umschalter erst beim Laden
    fixImages();
    wrapWide();
    navHint();
    spy();
    var j = readJump();
    if (j) setTimeout(function () { jump(j); wrapWide(); }, 350);
  }
  if (doc.readyState === 'complete') ready();
  else window.addEventListener('load', ready);
  window.addEventListener('resize', debounce(function () { wrapWide(); navHint(); }, 200));
  // Nach dem Auf- und Zuklappen von Abschnitten oder nachträglich erzeugtem Inhalt können neue breite Tabellen sichtbar werden
  var wrapSoon = debounce(wrapWide, 60);
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t.nodeType === 1 && !t.closest('nav, .toc-sidebar, [id^="hub-"], .hub-sw')) { wrapSoon(); return; }
      }
    }).observe(contentRoot(), { attributes: true, attributeFilter: ['class', 'open', 'hidden'], subtree: true, childList: true });
  }
})();
