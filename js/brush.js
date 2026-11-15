/* 墨戏 · 笔刷层
 * 用「笔尖点按」的方式画出水墨笔触：一组带飞白的墨点，沿路径按压力曲线叠压，
 * 这样边缘自然毛涩，不会像矢量线那样干净得发假。
 */
(function (A) {
  'use strict';

  const FONT = '"AR PL UKai CN", "AR PL UKai TW", "Kaiti SC", "STKaiti", "KaiTi", "BiauKai", "Noto Serif CJK SC", serif';

  const Brush = A.Brush = {
    FONT,
    INK: (a = 1) => `rgba(14,20,22,${a})`,
    SOFT: (a = 1) => `rgba(34,44,44,${a})`,
    RED: (a = 1) => `rgba(150,38,30,${a})`,
    dabs: [],
    glDab: null,
    paperNoise: null,
  };

  function makeDab(size, seed) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const cx = size / 2, r = size * 0.44;

    // 笔肚：数个偏心椭圆叠出毛边
    x.save();
    x.translate(cx, cx);
    const rot = A.rand(6.283);
    x.rotate(rot);
    for (let i = 0; i < 6; i++) {
      const rr = r * A.rand(1.0, 0.80);
      const g = x.createRadialGradient(0, 0, r * 0.05, 0, 0, rr);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.62, 'rgba(0,0,0,1)');
      g.addColorStop(0.88, 'rgba(0,0,0,0.92)');
      g.addColorStop(0.96, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(A.rand(3, -3), A.rand(3, -3), rr, rr * A.rand(1.0, 0.86), A.rand(0.3, -0.3), 0, 6.283);
      x.fill();
    }
    x.restore();

    // 笔毫刮出的细缝（飞白）
    x.globalCompositeOperation = 'destination-out';
    const n = Math.round(size * 0.16);
    for (let i = 0; i < n; i++) {
      const y0 = A.rand(size), x0 = A.rand(size);
      const len = A.rand(size * 0.42, size * 0.06);
      x.strokeStyle = `rgba(0,0,0,${A.rand(0.22, 0.04)})`;
      x.lineWidth = A.rand(size * 0.014, 0.4);
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x0 + A.rand(2.5, -2.5), y0 + len);
      x.stroke();
    }
    x.globalCompositeOperation = 'source-over';
    return c;
  }

  Brush.init = function () {
    for (let i = 0; i < 6; i++) this.dabs.push(makeDab(96, i));
    // 柔边墨晕，用于笔触外圈的渗化
    const sc = document.createElement('canvas');
    sc.width = sc.height = 96;
    const sx = sc.getContext('2d');
    const sg = sx.createRadialGradient(48, 48, 2, 48, 48, 46);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(0.55, 'rgba(0,0,0,0.32)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = sg;
    sx.beginPath(); sx.arc(48, 48, 46, 0, 6.283); sx.fill();
    this.softDab = sc;
    // WebGL 落笔用的笔尖印章（黑底白形）
    const s = 128, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
    const g = x.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.88, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(s / 2, s / 2, s * 0.44, s * 0.34, 0, 0, 6.283); x.fill();
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const px = A.rand(s), py = A.rand(s);
      x.strokeStyle = `rgba(0,0,0,${A.rand(0.8, 0.25)})`;
      x.lineWidth = A.rand(3, 0.6);
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + A.rand(8, -8), py + A.rand(34, 6));
      x.stroke();
    }
    x.globalCompositeOperation = 'source-over';
    this.glDab = c;

    // 用于字模飞白的纤维纹理
    const fs = 512, fc = document.createElement('canvas');
    fc.width = fc.height = fs;
    const fx = fc.getContext('2d');
    fx.fillStyle = '#fff'; fx.fillRect(0, 0, fs, fs);
    for (let i = 0; i < 900; i++) {
      const px = A.rand(fs), py = A.rand(fs), l = A.rand(70, 6);
      const ang = -Math.PI / 2 + A.rand(0.5, -0.5);
      fx.strokeStyle = `rgba(80,80,80,${A.rand(0.30, 0.05)})`;
      fx.lineWidth = A.rand(2.6, 0.4);
      fx.beginPath(); fx.moveTo(px, py); fx.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l); fx.stroke();
    }
    for (let i = 0; i < 260; i++) {
      fx.fillStyle = `rgba(70,70,70,${A.rand(0.22, 0.04)})`;
      fx.beginPath(); fx.arc(A.rand(fs), A.rand(fs), A.rand(3.5, 0.6), 0, 6.283); fx.fill();
    }
    this.paperNoise = fc;
  };

  Brush.dab = function (ctx, x, y, r, angle, alpha, stretch) {
    const d = this.dabs[(Math.random() * this.dabs.length) | 0];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.drawImage(d, (-r) * (stretch || 1), -r, r * 2 * (stretch || 1), r * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // 沿点列画一条笔触；points 为 [[x,y], ...]
  Brush.stroke = function (ctx, points, opt = {}) {
    if (!points || points.length < 2) return;
    const width = opt.width || 18;
    const alpha = opt.alpha != null ? opt.alpha : 0.9;
    const taper = opt.taper !== false;
    const jitter = opt.jitter != null ? opt.jitter : 0.5;
    const color = opt.color;
    const pow = opt.taperPow || 0.42;

    let total = 0;
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (total < 0.5) total = 0.5;

    const sample = (t) => {
      const target = t * total;
      let acc = 0;
      for (let i = 1; i < points.length; i++) {
        const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        if (acc + seg >= target) {
          const f = (target - acc) / (seg || 1);
          return {
            x: A.lerp(points[i - 1][0], points[i][0], f),
            y: A.lerp(points[i - 1][1], points[i][1], f),
            ang: Math.atan2(points[i][1] - points[i - 1][1], points[i][0] - points[i - 1][0]),
          };
        }
        acc += seg;
      }
      const last = points[points.length - 1], prev = points[points.length - 2];
      return { x: last[0], y: last[1], ang: Math.atan2(last[1] - prev[1], last[0] - prev[0]) };
    };

    const pressure = (t) => {
      if (!taper) return 1;
      return Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, t)))), pow);
    };

    // 外圈：渗化的淡墨
    if (opt.bleed !== false && width > 7) {
      const steps = Math.max(2, Math.ceil(total / (width * 0.55)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const p = sample(t);
        const r = width * 0.78 * (0.55 + 0.45 * pressure(t));
        ctx.save();
        ctx.globalAlpha = alpha * 0.085 * pressure(t);
        ctx.drawImage(this.softDab, p.x - r, p.y - r, r * 2, r * 2);
        ctx.restore();
      }
    }

    // 主笔：沿笔势点按，中段重、两头轻
    const spacing = Math.max(1.0, width * 0.062);
    let steps = Math.max(3, Math.ceil(total / spacing));
    steps = Math.min(steps, 520);
    let prevAng = 0;
    const seed = A.rand(100);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = sample(t);
      let ang = p.ang;
      if (Math.abs(ang - prevAng) > 1.2) ang = prevAng;
      prevAng = ang;
      const press = pressure(t);
      const rr = Math.max(0.6, width / 2 * press * (0.92 + A.noise1(t * 9 + seed) * 0.16));
      const a = alpha * (0.55 + 0.45 * press) * (0.82 + A.noise1(t * 13 + seed * 2) * 0.18);
      if (t > 0.9 && Math.random() < 0.22) continue;
      // 边缘毛涩：沿笔势缓慢起伏
      const n1 = A.noise1(t * 16 + seed) - 0.5;
      const oy = A.rand(jitter * 0.4, -jitter * 0.4);
      if (color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.min(1, a) * 0.6;
        ctx.beginPath();
        ctx.arc(p.x + n1 * width * 0.1, p.y + oy, Math.max(0.6, rr * 0.7), 0, 6.283);
        ctx.fill();
        ctx.restore();
      } else {
        this.dab(ctx, p.x + n1 * width * 0.12, p.y + oy, rr, ang, a, opt.stretch || 1);
      }
    }
    // 收笔的余锋
    if (!color && taper) {
      const last = sample(1), prev = sample(0.94);
      const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
      for (let i = 1; i <= 4; i++) {
        const d = i * (width * 0.22);
        const rr = width * 0.10 * (1 - i / 5);
        this.dab(ctx, last.x + Math.cos(ang) * d, last.y + Math.sin(ang) * d, Math.max(0.5, rr), ang, alpha * 0.25 * (1 - i / 5), 1);
      }
    }
  };

  // 一片叶子：起笔宽、收笔尖，下缘略直，像竹叶/柳叶的墨形
  Brush.leaf = function (ctx, x, y, len, wid, ang, alpha, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.42, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.34, wid * 0.55, 0, 0);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    const c = color || '18,26,28';
    g.addColorStop(0, `rgba(${c},${alpha * 0.9})`);
    g.addColorStop(0.55, `rgba(${c},${alpha})`);
    g.addColorStop(0.88, `rgba(${c},${alpha * 0.72})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fill();
    // 叶脉
    ctx.strokeStyle = `rgba(${c},${Math.min(1, alpha * 0.5)})`;
    ctx.lineWidth = Math.max(0.7, len * 0.02);
    ctx.beginPath();
    ctx.moveTo(len * 0.06, 0);
    ctx.quadraticCurveTo(len * 0.5, -wid * 0.12, len * 0.94, 0);
    ctx.stroke();
    ctx.restore();
  };

  Brush.wash = function (ctx, cx, cy, rx, ry, alpha, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    for (let i = 0; i < 7; i++) {
      const g = ctx.createRadialGradient(A.rand(rx * 0.2, -rx * 0.2), A.rand(ry * 0.2, -ry * 0.2), 1, 0, 0, Math.max(rx, ry));
      g.addColorStop(0, `rgba(20,28,30,${alpha * A.rand(1, 0.55)})`);
      g.addColorStop(0.7, `rgba(20,28,30,${alpha * 0.55})`);
      g.addColorStop(1, 'rgba(20,28,30,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.scale(1, ry / Math.max(1, rx));
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  Brush.makeSprite = function (w, h, drawFn, scale) {
    scale = scale || 1.6;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(w * scale));
    c.height = Math.max(2, Math.ceil(h * scale));
    const x = c.getContext('2d');
    x.scale(scale, scale);
    drawFn(x, w, h);
    return { canvas: c, w, h, scale };
  };

  // 字模：白字黑底（供 WebGL 采样），带轻微笔压起伏和飞白
  Brush.glyphMask = function (ch, px) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, px, px);

    const fs = Math.round(px * 0.82);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = px;
    const t = tmp.getContext('2d');
    t.fillStyle = '#000'; t.fillRect(0, 0, px, px);
    t.fillStyle = '#fff';
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    t.font = `${fs}px ${FONT}`;
    t.fillText(ch, px / 2, px * 0.515);

    // 逐行轻微错位，模拟手写的笔势
    for (let y = 0; y < px; y += 3) {
      const n = A.noise2(y * 0.035, 3.7) - 0.5;
      const dx = n * px * 0.010;
      g.drawImage(tmp, 0, y, px, 3, dx, y, px, 3);
    }

    // 飞白：用纤维纹理掏空一部分
    const pat = g.createPattern(this.paperNoise, 'repeat');
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 0.28;
    g.fillStyle = pat;
    g.fillRect(0, 0, px, px);
    g.globalAlpha = 1;

    // 边缘墨渗：柔化一圈
    g.globalCompositeOperation = 'destination-over';
    g.globalAlpha = 0.18;
    g.filter = 'blur(2px)';
    g.drawImage(tmp, 0, 0);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return c;
  };

  // 从字模里采样笔划点，供「字化形」的墨屑粒子使用
  Brush.glyphPoints = function (mask, max) {
    const w = mask.width, h = mask.height;
    const data = mask.getContext('2d').getImageData(0, 0, w, h).data;
    const pts = [];
    const step = Math.max(2, Math.round(w / 90));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (data[(y * w + x) * 4] > 140) {
          pts.push([x / w, y / h]);
        }
      }
    }
    if (pts.length > max) {
      const out = [];
      for (let i = 0; i < max; i++) out.push(pts[(Math.random() * pts.length) | 0]);
      return out;
    }
    return pts;
  };

  Brush.spriteCache = new Map();
})(window.INK);
