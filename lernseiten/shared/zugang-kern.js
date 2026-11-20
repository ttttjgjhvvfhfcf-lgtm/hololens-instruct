/* Lernportal – Kern der Anmeldung. Öffentlich und ohne Geheimnisse; läuft im Browser (Anmeldeseite, Service Worker) und in Node (zugang/zugang.mjs).

   Prinzip: Alle Seiten, Bilder und Daten des Portals liegen verschlüsselt (AES-256-GCM) unter inhalt/. Der Inhaltsschlüssel K ist mit dem
   Passwort verpackt (PBKDF2-SHA-256, „Hülle“ in shared/zugang.json). Wer das Passwort kennt, packt K aus; der Service Worker (sw.js) entschlüsselt
   damit jede Datei beim Abruf, sodass die Seiten ganz normal funktionieren. Ohne das Passwort ist der Inhalt unlesbar.

   Dateien: inhalt/<Name>.enc mit Name = HMAC(K, Pfad) (der Pfad bleibt verborgen). Inhalt = "LP" + Version + IV (12 Byte) + AES-GCM-Chiffretext.
   Die IV ist ein HMAC über Pfad und Inhalt (Synthetic IV): gleicher Inhalt ergibt gleiche Datei, geänderte Dateien ändern sich allein im Git-Verlauf. */
(function (root, factory) {
  var kripto = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
  var api = factory(kripto);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LernportalKern = api;
})(typeof self !== 'undefined' ? self : globalThis, function (crypto) {
  'use strict';
  var subtle = crypto && crypto.subtle;
  var te = new TextEncoder();
  var VERSION = 1;
  var KOPF = new Uint8Array([0x4c, 0x50, VERSION]);        // "LP" + Version
  var ITER = 600000;                                       // PBKDF2-Runden (OWASP-Empfehlung für SHA-256)
  var AAD = 'lernportal/v1/';
  var SALZ = te.encode('lernportal/v1');

  function fehler(code, text) { var e = new Error(text); e.code = code; return e; }
  function zufall(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function verketten() {
    var teile = [].slice.call(arguments), n = 0, i, o, p = 0;
    for (i = 0; i < teile.length; i++) n += teile[i].length;
    o = new Uint8Array(n);
    for (i = 0; i < teile.length; i++) { o.set(teile[i], p); p += teile[i].length; }
    return o;
  }
  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64(t) {
    t = String(t).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var s = atob(t), o = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return o;
  }
  function hex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }
  function pfadNormal(p) { return String(p).replace(/\\/g, '/').replace(/^\/+/, '').normalize('NFC'); }

  /* ── E-Mail-Adresse: nur Schuladressen, keine Bestätigung ──────────────────
     Geprüft wird nur die Form und die Domain; ob das Postfach wirklich der Person gehört, wird bewusst nicht geprüft.
     Erlaubt ist die Domain selbst und jede Subdomain davon (nicht „lbs4.salzburg.at.example.com“). */
  function emailPruefen(eingabe, domains) {
    var e = String(eingabe == null ? '' : eingabe).normalize('NFKC').trim().toLowerCase();
    var m = /^([a-z0-9][a-z0-9._%+'-]{0,63})@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.exec(e);
    if (!m) return { ok: false, grund: 'format' };
    var host = m[2];
    var erlaubt = (domains || []).some(function (d) { d = String(d).toLowerCase(); return host === d || host.slice(-(d.length + 1)) === '.' + d; });
    return erlaubt ? { ok: true, email: e, name: m[1], domain: host } : { ok: false, grund: 'domain', domain: host };
  }
  // vorname.nachname@… -> „Vorname Nachname“
  function anzeigename(email) {
    var lokal = String(email).split('@')[0].replace(/\+.*$/, '');
    return lokal.split(/[._%'-]+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ') || String(email);
  }

  /* ── Passwort -> Hülle um den Inhaltsschlüssel ───────────────────────────── */
  // Groß-/Kleinschreibung, Leerzeichen und Bindestriche zählen nicht (Handy-Tastaturen schreiben gern groß oder hängen ein Leerzeichen an)
  function passwortNormal(p) { return String(p == null ? '' : p).normalize('NFKC').toLowerCase().replace(/[\s-]+/g, ''); }
  async function passwortSchluessel(passwort, salz, iter) {
    var roh = await subtle.importKey('raw', te.encode(passwortNormal(passwort)), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: verketten(te.encode(AAD), salz), iterations: iter },
      roh, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function huelleMachen(passwort, K, iter) {
    iter = iter || ITER;
    var salz = zufall(16), iv = zufall(12);
    var key = await passwortSchluessel(passwort, salz, iter);
    var ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: te.encode(AAD + 'huelle') }, key, K));
    return { v: VERSION, iter: iter, salz: b64(salz), iv: b64(iv), k: b64(ct) };
  }
  async function huelleOeffnen(passwort, huelle) {
    if (!huelle || huelle.v !== VERSION) throw fehler('FORMAT', 'Unbekanntes Format der Schlüsselhülle');
    var key = await passwortSchluessel(passwort, unb64(huelle.salz), huelle.iter);
    try {
      return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(huelle.iv), additionalData: te.encode(AAD + 'huelle') }, key, unb64(huelle.k)));
    } catch (e) { throw fehler('PASSWORT', 'Passwort falsch'); }
  }

  /* ── Inhaltsschlüssel: Dateien ver- und entschlüsseln, Dateinamen ableiten ─── */
  async function schluessel(K) {
    if (!(K instanceof Uint8Array) || K.length !== 32) throw fehler('FORMAT', 'Der Inhaltsschlüssel muss 32 Byte lang sein');
    var master = await subtle.importKey('raw', K, 'HKDF', false, ['deriveKey', 'deriveBits']);
    var hkdf = function (info) { return { name: 'HKDF', hash: 'SHA-256', salt: SALZ, info: te.encode(info) }; };
    var aes = await subtle.deriveKey(hkdf('inhalt'), master, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    var hmac = { name: 'HMAC', hash: 'SHA-256' };
    var ivKey = await subtle.importKey('raw', await subtle.deriveBits(hkdf('iv'), master, 256), hmac, false, ['sign']);
    var nameKey = await subtle.importKey('raw', await subtle.deriveBits(hkdf('name'), master, 256), hmac, false, ['sign']);
    return {
      // Name der verschlüsselten Datei (ohne .enc) für einen Pfad wie "faecher/aee/seite.html"
      dateiname: async function (pfad) {
        return hex(new Uint8Array(await subtle.sign('HMAC', nameKey, te.encode(pfadNormal(pfad)))).subarray(0, 16));
      },
      verschluesseln: async function (pfad, klar) {
        pfad = pfadNormal(pfad);
        klar = klar instanceof Uint8Array ? klar : new Uint8Array(klar);
        var iv = new Uint8Array(await subtle.sign('HMAC', ivKey, verketten(te.encode(pfad), new Uint8Array([0]), klar))).subarray(0, 12);
        var ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: te.encode(AAD + pfad) }, aes, klar));
        return verketten(KOPF, iv, ct);
      },
      entschluesseln: async function (pfad, blob) {
        pfad = pfadNormal(pfad);
        blob = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
        if (blob.length < 3 + 12 + 16 || blob[0] !== KOPF[0] || blob[1] !== KOPF[1] || blob[2] !== VERSION) throw fehler('FORMAT', 'Unbekanntes Dateiformat');
        try {
          return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(3, 15), additionalData: te.encode(AAD + pfad) }, aes, blob.subarray(15)));
        } catch (e) { throw fehler('SCHLUESSEL', 'Entschlüsselung fehlgeschlagen'); }
      }
    };
  }

  /* ── Angemeldet bleiben: Schlüssel im Browser (IndexedDB), damit auch der Service Worker ihn lesen kann ───────── */
  var DB = 'lernportal', STORE = 'sitzung', SCHL = 'aktuell';
  function idb() {
    return new Promise(function (ok, nein) {
      if (typeof indexedDB === 'undefined') return nein(fehler('IDB', 'IndexedDB nicht verfügbar'));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { nein(r.error); };
    });
  }
  function idbTun(modus, fn) {
    return idb().then(function (db) {
      return new Promise(function (ok, nein) {
        var t = db.transaction(STORE, modus), q = fn(t.objectStore(STORE));
        t.oncomplete = function () { db.close(); ok(q && q.result); };
        t.onerror = t.onabort = function () { db.close(); nein(t.error); };
      });
    });
  }
  var sitzung = {
    // { k: Uint8Array(32), email, ablauf (ms) } oder null, wenn nicht angemeldet oder abgelaufen
    lesen: function () { return idbTun('readonly', function (s) { return s.get(SCHL); }).then(function (x) { return x && x.ablauf > Date.now() ? x : null; }); },
    schreiben: function (x) { return idbTun('readwrite', function (s) { return s.put(x, SCHL); }); },
    loeschen: function () { return idbTun('readwrite', function (s) { return s.delete(SCHL); }); }
  };

  var TYPEN = {
    html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8', pdf: 'application/pdf'
  };
  function typ(pfad) { var m = /\.([a-z0-9]+)$/i.exec(pfad); return (m && TYPEN[m[1].toLowerCase()]) || 'application/octet-stream'; }

  return {
    VERSION: VERSION, ITER: ITER, zufall: zufall, b64: b64, unb64: unb64, hex: hex, verketten: verketten, pfadNormal: pfadNormal,
    emailPruefen: emailPruefen, anzeigename: anzeigename, passwortNormal: passwortNormal,
    huelleMachen: huelleMachen, huelleOeffnen: huelleOeffnen, schluessel: schluessel, sitzung: sitzung, typ: typ
  };
});
