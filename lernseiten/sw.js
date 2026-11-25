/* Lernportal – Service Worker. Liefert die Seiten, Bilder und Daten aus dem verschlüsselten Bestand (inhalt/) aus, sobald ein gültiger Schlüssel
   vorliegt (nach der Anmeldung, gespeichert in IndexedDB). Für die Seiten selbst ändert sich dadurch nichts: Sie laden ihre Dateien unter den
   gewohnten Adressen, der Service Worker entschlüsselt sie unterwegs. Ohne Schlüssel gibt es nur die Anmeldeseite.
   Öffentlich bleiben nur dieses Skript, die Anmeldeseite, der Kern, die Symbole und der verschlüsselte Bestand selbst. */
'use strict';
importScripts('shared/zugang-kern.js');

var Kern = self.LernportalKern;
var BASIS = new URL('./', self.location.href).pathname;                 // z. B. /hololens-instruct/
var URSPRUNG = self.location.origin;
var CACHE = 'lernportal-inhalt-v1';                                     // verschlüsselte Dateien für den Betrieb ohne Netz
var OEFFENTLICH = ['sw.js', '404.html', 'shared/zugang-kern.js', 'shared/zugang.json', 'shared/icons/', 'inhalt/', 'zugang/'];
var FRISCH_MS = 60000;                                                  // so lange gilt der gemerkte Schlüssel, danach wird IndexedDB wieder befragt

var stand = null;                                                       // { s: Schlüsselobjekt, email, ablauf, geladen }

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (ev) { ev.waitUntil(self.clients.claim()); });

// Die Seiten melden das Abmelden, damit kein gemerkter Schlüssel zurückbleibt; die Antwort kommt erst, wenn alles gelöscht ist
self.addEventListener('message', function (ev) {
  var d = ev.data || {}, port = ev.ports && ev.ports[0];
  if (d.typ !== 'abmelden') return;
  stand = null;
  ev.waitUntil(self.caches.delete(CACHE).catch(function () {}).then(function () { if (port) port.postMessage('ok'); }));
});

function aktuell() {
  if (stand && stand.ablauf > Date.now() && Date.now() - stand.geladen < FRISCH_MS) return Promise.resolve(stand);
  return Kern.sitzung.lesen().catch(function () { return null; }).then(function (s) {
    if (!s) { stand = null; return null; }
    return Kern.schluessel(s.k).then(function (sk) {
      stand = { s: sk, email: s.email, ablauf: s.ablauf, geladen: Date.now() };
      return stand;
    });
  });
}

function zurAnmeldung(rel, suche, neu) {
  return Response.redirect(URSPRUNG + BASIS + '?weiter=' + encodeURIComponent(rel + suche) + (neu ? '&neu=1' : ''), 302);
}
function text(status, t) {
  return new Response(t, { status: status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Hinweisseite für Aufrufe, die der Service Worker nicht bedienen kann (kein Netz, Fehler, unbekannte Adresse). Sie ist eigenständig (kein Abruf fremder oder
// verschlüsselter Dateien, sonst fehlt sie genau dann, wenn man sie braucht), hell oder dunkel wie das Portal. Bilder, Skripte und Daten bekommen weiter nur Text.
var HINWEIS_CSS =
  ':root{--bg:#f1f4fb;--card:#fff;--ink:#0f172a;--muted:#46526b;--line:#cfd8ea;--brand:#2f4fd0;--focus:#f59e0b}' +
  '@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#070c18;--card:#101a2e;--ink:#e5eaf5;--muted:#b1bcd2;--line:#2a3a5c;--brand:#93b0ff;--focus:#fbbf24;color-scheme:dark}}' +
  ':root[data-theme=dark]{--bg:#070c18;--card:#101a2e;--ink:#e5eaf5;--muted:#b1bcd2;--line:#2a3a5c;--brand:#93b0ff;--focus:#fbbf24;color-scheme:dark}' +
  '*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
  'main{width:100%;max-width:26rem;padding:1.6rem 1.5rem;background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:0 10px 32px rgba(30,58,138,.14)}' +
  'svg{width:2.6rem;height:2.6rem;stroke:var(--brand);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
  'h1{margin:.5rem 0 .4rem;font-size:1.45rem;line-height:1.2}p{margin:.4rem 0;color:var(--muted)}.k{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.2rem}' +
  '.k a,.k button{font:600 1rem system-ui,sans-serif;min-height:2.9rem;padding:.6rem 1.1rem;border-radius:14px;border:1.5px solid var(--line);background:transparent;color:var(--brand);cursor:pointer;text-decoration:none;display:inline-grid;place-items:center}' +
  '.k .z{background:var(--brand);border-color:var(--brand);color:var(--card)}.k a:focus-visible,.k button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}' +
  '@media (forced-colors:active){main{border:1px solid CanvasText}}';
var HINWEIS_ICON = {
  netz: '<path d="M2 8.8a15 15 0 0 1 20 0M5.2 12.4a10 10 0 0 1 13.6 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.4" r=".9"/><path d="M3 3l18 18"/>',
  suche: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8M8.5 8.5l5 5M13.5 8.5l-5 5"/>',
  fehler: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.4" r=".9"/>'
};
// art: 'netz' | 'suche' | 'fehler'; nochmal: Knopf „Erneut versuchen“ (lädt die Seite neu, auch von selbst, sobald wieder Netz da ist)
function hinweis(status, art, titel, absatz, nochmal) {
  var h = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    '<meta name="color-scheme" content="light dark"><title>' + titel + ' – Lernportal</title><style>' + HINWEIS_CSS + '</style>' +
    '<script>try{var t=JSON.parse(localStorage.getItem("lern-theme"));if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script></head>' +
    '<body><main role="alert"><svg viewBox="0 0 24 24" aria-hidden="true">' + HINWEIS_ICON[art] + '</svg><h1>' + titel + '</h1><p>' + absatz + '</p><p class="k">' +
    (nochmal ? '<button type="button" class="z" onclick="location.reload()">Erneut versuchen</button>' : '') +
    '<a' + (nochmal ? '' : ' class="z"') + ' href="' + BASIS + '">Zur Startseite</a></p></main>' +
    (nochmal ? '<script>addEventListener("online",function(){location.reload()})</script>' : '') + '</body></html>';
  return new Response(h, { status: status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function keinNetz(nav, was) {
  return nav ? hinweis(503, 'netz', 'Kein Netz', was + ' Bereits geöffnete Seiten funktionieren auch ohne Netz.', true)
             : text(503, 'Kein Netz, und diese Datei ist noch nicht gespeichert.');
}
function nichtGefunden(nav) {
  return nav ? hinweis(404, 'suche', 'Seite nicht gefunden', 'Diese Adresse gibt es im Lernportal nicht (mehr). Über die Startseite findest du alle Fächer und die Suche.', false)
             : text(404, 'Nicht gefunden.');
}

// Verschlüsselte Datei holen: immer beim Server nachfragen (ETag), nur ohne Netz aus dem Zwischenspeicher
function holen(url) {
  return fetch(url, { cache: 'no-cache' }).then(function (a) {
    if (a.ok) { var kopie = a.clone(); self.caches.open(CACHE).then(function (c) { return c.put(url, kopie); }).catch(function () {}); }
    return a;
  }, function () {
    return self.caches.match(url).then(function (g) { return g || null; });
  });
}

// Schlüssel passt nicht mehr (Passwortwechsel): vergessen und neu anmelden lassen
function ungueltig(rel, u, nav) {
  stand = null;
  return Promise.all([Kern.sitzung.loeschen().catch(function () {}), self.caches.delete(CACHE).catch(function () {})]).then(function () {
    return nav ? zurAnmeldung(rel, u.search, true) : text(401, 'Bitte neu anmelden.');
  });
}
function bestandUrl(st, pfad) {
  return st.s.dateiname(pfad).then(function (name) { return URSPRUNG + BASIS + 'inhalt/' + name + '.enc'; });
}

function bedienen(req, u, rel) {
  var nav = req.mode === 'navigate';
  return aktuell().then(function (st) {
    if (!st) {
      if (rel === 'index.html') {                                       // Anmeldeseite vom Server; ohne Netz eine Erklärung statt der Fehlerseite des Browsers
        return fetch(req).catch(function () { return keinNetz(nav, 'Zum Anmelden braucht das Lernportal einmal eine Internetverbindung.'); });
      }
      return nav ? zurAnmeldung(rel, u.search, false) : text(401, 'Bitte anmelden.');
    }
    return bestandUrl(st, rel).then(holen).then(function (a) {
      if (!a) return keinNetz(nav, 'Diese Seite wurde auf diesem Gerät noch nicht geöffnet und ist darum nicht gespeichert.');
      if (a.status === 404) {
        // Fehlt die Datei, oder passt der Schlüssel zu keinem Bestand mehr? Die Dateiliste ist immer da, wenn der Schlüssel stimmt.
        return bestandUrl(st, '.verzeichnis').then(holen).then(function (v) {
          return v && v.status === 404 ? ungueltig(rel, u, nav) : nichtGefunden(nav);
        });
      }
      if (!a.ok) {
        var fs = a.status >= 400 && a.status < 600 ? a.status : 502;
        return nav ? hinweis(fs, 'fehler', 'Seite nicht erreichbar', 'Der Server hat gerade mit einem Fehler geantwortet (' + fs + '). Bitte gleich noch einmal versuchen.', true)
                   : text(502, 'Fehler beim Laden (' + a.status + ').');
      }
      return a.arrayBuffer().then(function (buf) {
        return st.s.entschluesseln(rel, new Uint8Array(buf)).then(function (klar) {
          return new Response(klar, { status: 200, headers: { 'Content-Type': Kern.typ(rel), 'X-Content-Type-Options': 'nosniff' } });
        }, function () { return ungueltig(rel, u, nav); });
      });
    });
  });
}

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url), rel;
  if (u.origin !== URSPRUNG || u.pathname.indexOf(BASIS) !== 0) return;
  try { rel = decodeURIComponent(u.pathname.slice(BASIS.length)); } catch (e) { return; }
  if (rel === '' || rel.slice(-1) === '/') rel += 'index.html';
  for (var i = 0; i < OEFFENTLICH.length; i++) {
    var p = OEFFENTLICH[i];
    if (p.slice(-1) === '/' ? rel.indexOf(p) === 0 : rel === p) return;
  }
  ev.respondWith(bedienen(req, u, rel));
});
