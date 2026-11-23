/* API-Schicht: spricht entweder mit dem Server (HttpApi) oder mit der Demo-Engine im Browser (DemoApi).
 * Beide haben dieselben Methoden und liefern dieselben Datenformen wie /api/state.
 */
(function (root) {
  'use strict';

  class ApiError extends Error {
    constructor(status, message, noBackend = false) {
      super(message);
      this.status = status;
      this.noBackend = noBackend;   // kein Server da (z. B. statisch gehostet) -> Demo-Modus anbieten
    }
  }

  class HttpApi {
    constructor() { this.kind = 'server'; }

    async request(path, opts = {}) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      try {
        const res = await fetch(path, { cache: 'no-store', signal: ctrl.signal, ...opts });
        const isJson = (res.headers.get('content-type') || '').includes('json');
        const data = isJson ? await res.json() : null;
        // Eine Antwort ohne JSON (HTML-Fehlerseite o. ä.) stammt nicht von unserem Server,
        // z. B. weil die Seite statisch gehostet wird -> Demo-Modus anbieten.
        if (!res.ok && !isJson) throw new ApiError(res.status, 'Kein Server gefunden', true);
        if (!res.ok) throw new ApiError(res.status, (data && data.error) || `HTTP ${res.status}`);
        if (data === null) throw new ApiError(res.status, 'Keine JSON-Antwort', true);
        return data;
      } finally {
        clearTimeout(timer);
      }
    }

    getState() { return this.request('/api/state'); }

    history(since, raceId) {
      return this.request(`/api/history?from=${since}${raceId == null ? '' : `&race=${raceId}`}`);
    }

    post(path, body) {
      return this.request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
    }
  }

  class DemoApi {
    constructor({ speed = 1 } = {}) {
      const E = root.WCEngine;
      this.kind = 'demo';
      this.players = [
        { id: 'anna', name: 'Anna', color: 'red', sim_w: 32 },
        { id: 'ben', name: 'Ben', color: 'cyan', sim_w: 26 },
      ];
      let storage = null;
      try { storage = root.localStorage; } catch (err) { /* gesperrt */ }
      this.race = new E.Race(this.players, { results: new E.MemoryResults(storage) });
      this.sensor = new E.SimSensor(this.players, { speed });
      this.BusyError = E.BusyError;
      this.timer = setInterval(() => this.race.update(this.sensor.read()), 100);
    }

    async getState() {
      const s = this.race.snapshot();
      s.config = { title: 'watt champion', sponsor_logo: null, sensor: 'demo' };
      return s;
    }

    async history(since, raceId) { return this.race.getHistory(since, raceId); }

    async post(path, body = {}) {
      try {
        if (path === '/api/start') {
          if (!this.race.start()) throw new ApiError(409, 'Es läuft bereits ein Rennen');
        } else if (path === '/api/reset') {
          this.race.reset();
        } else if (path === '/api/setup') {
          const bad = Object.keys(body).filter((k) => !['mode', 'goal', 'count', 'names'].includes(k));
          if (bad.length) throw new ApiError(400, `Unbekannte Felder: ${bad.sort().join(', ')}`);
          this.race.configure(body);
        } else {
          throw new ApiError(404, 'Unbekannter Endpunkt');
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(err instanceof this.BusyError ? 409 : 400, err.message);
      }
      return this.getState();
    }
  }

  root.WCApi = { ApiError, HttpApi, DemoApi };
}(typeof self !== 'undefined' ? self : this));
