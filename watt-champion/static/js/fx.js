/* Ton (WebAudio, ohne Audiodateien) und Konfetti. */
(function (root) {
  'use strict';

  const reduceMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ Ton
  const Sound = (() => {
    let ctx = null;
    let muted = false;
    try { muted = root.localStorage.getItem('wattchampion.muted') === '1'; } catch (err) { /* ignorieren */ }

    function context() {
      if (!ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    function tone(freq, at, dur, type = 'sine', gain = 0.16) {
      const c = context();
      if (!c || muted) return;
      const osc = c.createOscillator();
      const g = c.createGain();
      const t0 = c.currentTime + at;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    return {
      get muted() { return muted; },
      /** Erste Berührung: Chrome erlaubt Ton erst nach einer Nutzeraktion. */
      unlock() { if (!muted) context(); },
      toggle() {
        muted = !muted;
        try { root.localStorage.setItem('wattchampion.muted', muted ? '1' : '0'); } catch (err) { /* ignorieren */ }
        if (!muted) { context(); tone(660, 0, 0.12); }
        return muted;
      },
      tick() { tone(440, 0, 0.18, 'square', 0.08); },
      go() { tone(880, 0, 0.5, 'square', 0.1); },
      finish() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.35, 'triangle', 0.16)); },
      record() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.6 + i * 0.12, 0.4, 'triangle', 0.14)); },
    };
  })();

  // ------------------------------------------------------------------ Konfetti
  const Confetti = (() => {
    let canvas = null;
    let raf = 0;

    function burst(colors) {
      if (reduceMotion()) return;
      canvas = canvas || root.document.getElementById('confetti');
      if (!canvas) return;
      const dpr = root.devicePixelRatio || 1;
      const w = root.innerWidth;
      const h = root.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const palette = colors.concat(['#ffc61a', '#ffffff']);
      const size = Math.max(6, Math.min(w, h) / 70);
      const parts = Array.from({ length: 140 }, (_, i) => {
        const fromLeft = i % 2 === 0;
        const angle = (fromLeft ? -0.35 : -0.65) * Math.PI + (Math.random() - 0.5) * 0.7;
        const speed = (0.8 + Math.random() * 0.9) * h * 0.9;
        return {
          x: fromLeft ? w * 0.12 : w * 0.88,
          y: h * 1.0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * 6.28,
          vr: (Math.random() - 0.5) * 12,
          color: palette[Math.floor(Math.random() * palette.length)],
          s: size * (0.6 + Math.random() * 0.8),
        };
      });
      const born = performance.now();
      cancelAnimationFrame(raf);
      let last = born;
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const age = (now - born) / 1000;
        ctx.clearRect(0, 0, w, h);
        parts.forEach((p) => {
          p.vy += h * 1.5 * dt;          // Schwerkraft
          p.vx *= 1 - 0.6 * dt;          // Luftwiderstand
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, 4.5 - age));
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s / 1.6);
          ctx.restore();
        });
        if (age < 4.5) raf = requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, w, h);
      };
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      cancelAnimationFrame(raf);
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    return { burst, stop };
  })();

  root.WCFx = { Sound, Confetti };
}(typeof self !== 'undefined' ? self : this));
