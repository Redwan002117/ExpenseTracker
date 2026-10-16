/* ==========================================================================
   Charts — tiny canvas renderers (no libraries)
   ========================================================================== */

const Charts = (() => {
  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Sizes the canvas for the device pixel ratio and returns a 2D context in CSS pixels. */
  function setup(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Donut chart.
   * @param {HTMLCanvasElement} canvas
   * @param {{value:number,color:string}[]} data
   * @param {{label:string, value:string}} center
   */
  function donut(canvas, data, center) {
    if (!canvas || !canvas.isConnected || canvas.offsetParent === null) return;
    const { ctx, w, h } = setup(canvas);
    const size = Math.min(w, h);
    const cx = w / 2, cy = h / 2;
    const radius = size / 2 - 6;
    const thickness = Math.max(14, size * 0.13);
    const total = data.reduce((s, d) => s + d.value, 0);

    ctx.lineCap = 'round';
    ctx.lineWidth = thickness;

    // track
    ctx.strokeStyle = css('--recess');
    ctx.beginPath();
    ctx.arc(cx, cy, radius - thickness / 2, 0, Math.PI * 2);
    ctx.stroke();

    if (total > 0) {
      const gap = data.length > 1 ? 0.06 : 0;
      let start = -Math.PI / 2;
      data.forEach(d => {
        const sweep = (d.value / total) * Math.PI * 2;
        const a0 = start + gap / 2;
        const a1 = start + sweep - gap / 2;
        if (a1 > a0) {
          ctx.strokeStyle = d.color;
          ctx.beginPath();
          ctx.arc(cx, cy, radius - thickness / 2, a0, a1);
          ctx.stroke();
        }
        start += sweep;
      });
    }

    if (center) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = css('--muted');
      ctx.font = `900 ${Math.max(9, size * 0.055)}px Nunito, sans-serif`;
      ctx.fillText(center.label.toUpperCase(), cx, cy - size * 0.07);
      ctx.fillStyle = css('--ink');
      let fontSize = Math.max(14, size * 0.12);
      ctx.font = `900 ${fontSize}px Nunito, sans-serif`;
      const maxW = (radius - thickness) * 1.7;
      while (ctx.measureText(center.value).width > maxW && fontSize > 10) {
        fontSize -= 1;
        ctx.font = `900 ${fontSize}px Nunito, sans-serif`;
      }
      ctx.fillText(center.value, cx, cy + size * 0.05);
    }
  }

  /**
   * Grouped bar chart (income vs expense per month).
   * @param {HTMLCanvasElement} canvas
   * @param {{label:string, income:number, expense:number}[]} rows
   * @param {(n:number)=>string} formatTick
   */
  function bars(canvas, rows, formatTick) {
    if (!canvas || !canvas.isConnected || canvas.offsetParent === null) return;
    const { ctx, w, h } = setup(canvas);
    const pad = { top: 12, right: 8, bottom: 28, left: 48 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const max = niceMax(Math.max(1, ...rows.flatMap(r => [r.income, r.expense])));

    // grid + y labels
    ctx.font = '800 10px Nunito, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = pad.top + plotH - (plotH * i) / steps;
      ctx.strokeStyle = css('--border');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, Math.round(y) + 0.5);
      ctx.lineTo(w - pad.right, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = css('--muted');
      ctx.fillText(formatTick((max * i) / steps), pad.left - 8, y);
    }

    // bars
    const group = plotW / rows.length;
    const barW = Math.min(22, group * 0.28);
    const income = css('--emerald');
    const expense = css('--rose');
    rows.forEach((r, i) => {
      const gx = pad.left + group * i + group / 2;
      [[r.income, income, -1], [r.expense, expense, 1]].forEach(([v, color, side]) => {
        const bh = (v / max) * plotH;
        if (bh <= 0) return;
        const x = gx + (side < 0 ? -barW - 2 : 2);
        ctx.fillStyle = color;
        roundedRect(ctx, x, pad.top + plotH - bh, barW, bh, 6);
        ctx.fill();
      });
      ctx.fillStyle = css('--body-2');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '800 11px Nunito, sans-serif';
      ctx.fillText(r.label, gx, pad.top + plotH + 10);
    });
  }

  function niceMax(v) {
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * exp;
  }

  return { donut, bars };
})();
