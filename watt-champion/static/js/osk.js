/* Bildschirmtastatur für Namen (QWERTZ) – der Pi im Kiosk-Modus hat meist keine Tastatur. */
(function (root) {
  'use strict';

  const ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
    ['Y', 'X', 'C', 'V', 'B', 'N', 'M', 'ß', '-', '⌫'],
  ];

  /** Groß- und Kleinschreibung automatisch: Wortanfang groß, sonst klein. */
  function addChar(text, ch) {
    const atWordStart = text === '' || /[\s-]$/.test(text);
    return text + (atWordStart ? ch.toUpperCase() : ch.toLowerCase());
  }

  class Osk {
    constructor(host) {
      this.host = host;
      this.text = '';
      this.max = 16;
      this.onDone = null;
      this.build();
    }

    get isOpen() { return !this.host.hidden; }

    build() {
      const card = root.document.createElement('div');
      card.className = 'osk-card';
      card.innerHTML = '<div class="osk-title"></div><div class="osk-display"><span class="osk-text"></span><i class="osk-caret"></i></div>';
      const keys = root.document.createElement('div');
      keys.className = 'osk-keys';
      ROWS.forEach((row) => {
        const r = root.document.createElement('div');
        r.className = 'osk-row';
        row.forEach((k) => {
          const b = root.document.createElement('button');
          b.type = 'button';
          b.className = `osk-key${k === '⌫' ? ' osk-back' : ''}`;
          b.textContent = k;
          b.dataset.key = k;
          b.setAttribute('aria-label', k === '⌫' ? 'Löschen' : k);
          r.append(b);
        });
        keys.append(r);
      });
      const last = root.document.createElement('div');
      last.className = 'osk-row osk-actions';
      last.innerHTML = '<button type="button" class="osk-key osk-cancel" data-key="cancel">Abbrechen</button>'
        + '<button type="button" class="osk-key osk-space" data-key=" " aria-label="Leerzeichen">&nbsp;</button>'
        + '<button type="button" class="osk-key osk-ok" data-key="ok">OK</button>';
      keys.append(last);
      card.append(keys);
      this.host.replaceChildren(card);
      this.titleEl = card.querySelector('.osk-title');
      this.textEl = card.querySelector('.osk-text');
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) this.press(btn.dataset.key);
      });
      // Klick auf den Hintergrund = Abbrechen
      this.host.addEventListener('click', (e) => { if (e.target === this.host) this.close(false); });
    }

    open({ title, value, max = 16, onDone }) {
      this.text = value || '';
      this.max = max;
      this.onDone = onDone;
      this.titleEl.textContent = title;
      this.render();
      this.host.hidden = false;
    }

    close(accept) {
      const done = this.onDone;
      const text = this.text.trim();
      this.host.hidden = true;
      this.onDone = null;
      if (accept && done && text) done(text);
    }

    render() { this.textEl.textContent = this.text; }

    press(key) {
      if (key === 'ok') return this.close(true);
      if (key === 'cancel') return this.close(false);
      if (key === '⌫') this.text = this.text.slice(0, -1);
      else if (key === ' ') {
        if (this.text && !this.text.endsWith(' ') && this.text.length < this.max) this.text += ' ';
      } else if (this.text.length < this.max) this.text = addChar(this.text, key);
      this.render();
      return undefined;
    }

    /** Eine echte Tastatur funktioniert auch. Gibt true zurück, wenn die Taste verbraucht wurde. */
    handleKey(e) {
      if (!this.isOpen) return false;
      if (e.key === 'Enter') this.press('ok');
      else if (e.key === 'Escape') this.press('cancel');
      else if (e.key === 'Backspace') this.press('⌫');
      else if (e.key === ' ') this.press(' ');
      else if (e.key.length === 1 && /[\p{L}\d-]/u.test(e.key) && !e.ctrlKey && !e.metaKey) this.press(e.key);
      else return true;
      e.preventDefault();
      return true;
    }
  }

  root.WCOsk = { Osk, addChar };
}(typeof self !== 'undefined' ? self : this));
