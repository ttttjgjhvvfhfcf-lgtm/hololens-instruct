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
function nichtGefunden() {
  var h = '<!DOCTYPE html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nicht gefunden</title>' +
    '<body style="font:16px system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto"><h1>Seite nicht gefunden</h1><p><a href="' + BASIS + '">Zurück zum Lernportal</a></p>';
  return new Response(h, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
      if (rel === 'index.html') return fetch(req);                      // Anmeldeseite vom Server
      return nav ? zurAnmeldung(rel, u.search, false) : text(401, 'Bitte anmelden.');
    }
    return bestandUrl(st, rel).then(holen).then(function (a) {
      if (!a) return text(503, 'Kein Netz, und diese Seite ist noch nicht gespeichert.');
      if (a.status === 404) {
        // Fehlt die Datei, oder passt der Schlüssel zu keinem Bestand mehr? Die Dateiliste ist immer da, wenn der Schlüssel stimmt.
        return bestandUrl(st, '.verzeichnis').then(holen).then(function (v) {
          return v && v.status === 404 ? ungueltig(rel, u, nav) : nichtGefunden();
        });
      }
      if (!a.ok) return text(502, 'Fehler beim Laden (' + a.status + ').');
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
