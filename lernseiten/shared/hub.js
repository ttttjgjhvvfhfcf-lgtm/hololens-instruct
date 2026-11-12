/* Lernportal – gemeinsames Skript für alle Fachseiten.
   1) Link zurück zur Übersicht  2) Sprung zum Suchtreffer aus dem Portal */
(function () {
  'use strict';
  var HOME = (document.currentScript && document.currentScript.dataset.home) || '../../index.html';
  var norm = function (s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
  };

  function addBackLink() {
    if (document.getElementById('hub-back')) return;
    var a = document.createElement('a');
    a.id = 'hub-back';
    a.href = HOME;
    a.textContent = '← Alle Fächer';
    a.title = 'Zurück zur Übersicht';
    var css = document.createElement('style');
    css.textContent =
      '#hub-back{display:inline-flex;align-items:center;gap:.3rem;padding:.33rem .7rem;border-radius:9px;' +
      'font:600 .78rem Inter,system-ui,sans-serif;text-decoration:none;white-space:nowrap;' +
      'color:var(--primary,#1e3a8a);background:var(--card,#fff);border:1px solid var(--border,#e2e8f0)}' +
      '#hub-back:hover{filter:brightness(.96)}' +
      '#hub-back.hub-float{position:fixed;left:12px;bottom:12px;z-index:60;box-shadow:0 4px 14px rgba(0,0,0,.18)}' +
      'mark.hub-hit{background:#fde047;color:#111;border-radius:3px;padding:0 2px}' +
      '.hub-target{outline:3px solid #f59e0b;outline-offset:4px;border-radius:6px}' +
      '@media print{#hub-back{display:none}}';
    document.head.appendChild(css);
    var nav = document.querySelector('nav, .formula-nav');
    if (nav) nav.insertBefore(a, nav.firstChild);
    else { a.className = 'hub-float'; document.body.appendChild(a); }
  }

  function readJump() {
    var j = null;
    try {
      var h = decodeURIComponent(location.hash.slice(1));
      if (h.indexOf('hub:') === 0) j = JSON.parse(h.slice(4));
    } catch (e) {}
    if (!j) {
      try {
        var s = JSON.parse(sessionStorage.getItem('lern-jump') || 'null');
        if (s && Date.now() - s.ts < 15000 && location.pathname.slice(-s.p.length) === s.p) j = s;
        sessionStorage.removeItem('lern-jump');
      } catch (e) {}
    }
    return j;
  }

  var SKIP = '#exam-modal,#exam-overlay,[id*="modal"],[class*="overlay"],nav,header,script,style,.katex';
  var HEADS = 'h2,h3,h4,.sum-title,.aufgabe-title,.card-title,.textbook-head';

  function highlight(root, words) {
    var first = null;
    var re = null;
    try { re = new RegExp('(' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi'); } catch (e) { return null; }
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SKIP))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = tw.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var txt = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(txt)) return;
      var frag = document.createDocumentFragment();
      txt.split(re).forEach(function (part, i) {
        if (i % 2) {
          var m = document.createElement('mark');
          m.className = 'hub-hit';
          m.textContent = part;
          frag.appendChild(m);
          if (!first) first = m;
        } else if (part) frag.appendChild(document.createTextNode(part));
      });
      node.parentNode.replaceChild(frag, node);
    });
    return first;
  }

  function jump(j) {
    var root = document.querySelector('main') || document.body;
    var target = null;
    var find = function (scope, text) {
      var want = norm(text), hs = scope.querySelectorAll(HEADS);
      for (var i = 0; i < hs.length; i++) if (!hs[i].closest(SKIP) && norm(hs[i].textContent) === want) return hs[i];
      return null;
    };
    if (j.at) {
      var par = j.k ? find(root, j.k) : null;
      var box = par && par.closest('.sum-wrap, .aufgabe, .card');
      target = (box && find(box, j.at)) || find(root, j.at);
    }
    // Eingeklappte Abschnitte öffnen
    if (target) {
      var c = target.closest('.collapsed');
      while (c) { c.classList.remove('collapsed'); c = c.parentElement && c.parentElement.closest('.collapsed'); }
    }
    var words = (j.q || '').split(/\s+/).filter(function (w) { return w.length > 1; });
    var scope = target ? (target.closest('.sum-wrap, .aufgabe, .card') || root) : root;
    var first = words.length ? highlight(scope, words) : null;
    var el = target || first;
    if (!el) return;
    if (first && !target) { var cc = first.closest('.collapsed'); if (cc) cc.classList.remove('collapsed'); }
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -80);
    if (target) { target.classList.add('hub-target'); setTimeout(function () { target.classList.remove('hub-target'); }, 2600); }
  }

  function start() {
    addBackLink();
    var j = readJump();
    if (j) setTimeout(function () { jump(j); }, 350);
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
