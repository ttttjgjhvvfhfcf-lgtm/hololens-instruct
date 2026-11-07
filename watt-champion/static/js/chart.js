/* Live-Leistungskurve auf einem Canvas (ohne Bibliothek). */
(function (root) {
  'use strict';

  const NICE = [10, 20, 25, 40, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000];
  const niceMax = (v) => NICE.find((n) => n >= v) || Math.ceil(v / 1000) * 1000;

  class PowerChart {
    /**
     * @param canvas  das Canvas-Element
     * @param fmtX    Formatierung der Zeitachse (Sekunden -> Text)
     */
    constructor(canvas, fmtX) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fmtX = fmtX;
      this.series = [];
      this.xMax = 30;
      if (root.ResizeObserver) new root.ResizeObserver(() => this.draw()).observe(canvas);
    }

    /** series: [{color, points: [[t, watt | null], ...]}] */
    set(series, xMax) {
      this.series = series;
      this.xMax = xMax;
      this.draw();
    }

    draw() {
      const { canvas, ctx } = this;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = root.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const rem = parseFloat(getComputedStyle(root.document.documentElement).fontSize) || 16;
      const left = 2.3 * rem;
      const right = 0.4 * rem;
      const top = 0.45 * rem;
      const bottom = 1.15 * rem;
      const pw = w - left - right;
      const ph = h - top - bottom;
      if (pw < 10 || ph < 10) return;

      let peak = 0;
      let any = false;
      this.series.forEach((s) => s.points.forEach(([, v]) => { if (v !== null) { peak = Math.max(peak, v); any = true; } }));
      const yMax = niceMax(Math.max(peak * 1.1, 10));
      const x = (t) => left + Math.min(1, t / this.xMax) * pw;
      const y = (v) => top + ph - (v / yMax) * ph;

      ctx.font = `600 ${0.62 * rem}px Rajdhani, sans-serif`;
      ctx.fillStyle = 'rgba(160, 170, 190, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      [0, 0.5, 1].forEach((f) => {
        const gy = Math.round(y(yMax * f)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(left, gy);
        ctx.lineTo(left + pw, gy);
        ctx.stroke();
        ctx.fillText(`${Math.round(yMax * f)}`, left - 0.4 * rem, gy);
      });
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(this.fmtX(0), left, top + ph + 0.25 * rem);
      ctx.textAlign = 'right';
      ctx.fillText(this.fmtX(this.xMax), left + pw, top + ph + 0.25 * rem);

      if (!any) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Warte auf Messwerte …', left + pw / 2, top + ph / 2);
        return;
      }

      this.series.forEach((s) => {
        // Linie mit Lücken, wo Messwerte fehlen
        const segments = [];
        let cur = [];
        s.points.forEach(([t, v]) => {
          if (v === null) { if (cur.length) segments.push(cur); cur = []; } else cur.push([x(t), y(v)]);
        });
        if (cur.length) segments.push(cur);
        const grad = ctx.createLinearGradient(0, top, 0, top + ph);
        grad.addColorStop(0, `${s.color}40`);
        grad.addColorStop(1, `${s.color}00`);
        segments.forEach((seg) => {
          if (seg.length > 1) {
            ctx.beginPath();
            ctx.moveTo(seg[0][0], top + ph);
            seg.forEach(([px, py]) => ctx.lineTo(px, py));
            ctx.lineTo(seg[seg.length - 1][0], top + ph);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
          }
          ctx.beginPath();
          seg.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 0.16 * rem;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
        });
        const last = segments.length ? segments[segments.length - 1] : null;
        if (last) {
          const [lx, ly] = last[last.length - 1];
          ctx.beginPath();
          ctx.arc(lx, ly, 0.24 * rem, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
        }
      });
    }
  }

  root.WCChart = { PowerChart, niceMax };
}(typeof self !== 'undefined' ? self : this));
