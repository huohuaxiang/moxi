/* 墨戏 · 物象
 * 每个字是一门「物象」：程序化笔触画成的小画，会随风、随雨、随彼此而活。
 */
(function (A) {
  'use strict';

  const B = A.Brush;
  A.ENTITIES = {};
  A.RULES = [];

  // ---------- 小工具 ----------
  function quad(x0, y0, cx, cy, x1, y1, n) {
    n = n || 18;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, it = 1 - t;
      pts.push([it * it * x0 + 2 * it * t * cx + t * t * x1,
        it * it * y0 + 2 * it * t * cy + t * t * y1]);
    }
    return pts;
  }
  function line(x0, y0, x1, y1, n) {
    n = n || 12; const pts = [];
    for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    return pts;
  }
  A.quadPath = quad;
  A.linePath = line;

  class Entity {
    constructor(world, ch, x, y) {
      this.world = world;
      this.char = ch;
      this.x = x; this.y = y;
      this.age = 0;
      this.reveal = 0;
      this.alpha = 1;
      this.z = 2;
      this.dead = false;
      this.seed = A.rand(1000);
      this.k = A.clamp(Math.min(world.w, world.h) / 820, 0.55, 1.45);
      this.sway = A.rand(6.283);
      this.kind = 'object';
    }
    update(dt) {
      this.age += dt;
      this.reveal = Math.min(1, this.reveal + dt * 2.2);
    }
    get e() { return A.easeOutCubic(this.reveal); }
    draw(ctx) {
      if (this.reveal <= 0.01) return;
      ctx.save();
      const e = this.e;
      ctx.globalAlpha = this.alpha * e;
      this.render(ctx, e);
      ctx.restore();
    }
    render() {}
    get windX() { return this.world.wind.x; }
    get windY() { return this.world.wind.y; }
  }
  A.Entity = Entity;

  function sprite(w, h, fn) {
    return B.makeSprite(w, h, fn, 1.7);
  }

  // ---------- 山 ----------
  // Catmull-Rom 平滑，山脊才不会是折线锯口
  function smooth(P, n) {
    n = n || 160;
    const out = [];
    const N = P.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) * (N - 1);
      const i0 = Math.floor(t), f = t - i0;
      const p0 = P[Math.max(0, i0 - 1)], p1 = P[i0], p2 = P[Math.min(N - 1, i0 + 1)], p3 = P[Math.min(N - 1, i0 + 2)];
      const q = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
      out.push([q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])]);
    }
    return out;
  }
  A.smoothPath = smooth;

  A.ENTITIES['山'] = class Mountain extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 1;
      this.W = 640; this.H = 430;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        const layer = (pts, dark, back) => {
          const P = smooth(pts.map(p => [p[0] * w, p[1] * h]), 220);
          g.save();
          g.beginPath();
          P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
          g.closePath();
          g.clip();
          const top = Math.min(...P.map(p => p[1]));
          const vg = g.createLinearGradient(0, top, 0, h * 1.02);
          vg.addColorStop(0, `rgba(24,32,34,${dark * 0.5})`);
          vg.addColorStop(0.2, `rgba(24,32,34,${dark * 1.15})`);
          vg.addColorStop(0.72, `rgba(24,32,34,${dark * 0.8})`);
          vg.addColorStop(1, `rgba(24,32,34,${dark * 0.1})`);
          g.fillStyle = vg;
          g.fill();

          if (!back) {
            for (let i = 0; i < 26; i++) {
              const idx0 = 8 + Math.floor(A.rand(P.length - 26));
              const p0 = P[idx0];
              const len = A.rand(120, 40);
              B.stroke(g, [[p0[0], p0[1] + 4], [p0[0] + A.rand(24, -24), p0[1] + len]], {
                width: A.rand(26, 12), alpha: A.rand(0.06, 0.02), taper: true, jitter: 2,
              });
            }
            // 披麻皴：从山脊往山脚拖的长笔
            for (let i = 0; i < 90; i++) {
              const idx = 10 + Math.floor(A.rand(P.length - 30));
              const p = P[idx];
              if (p[1] > h * 0.9) continue;
              const len = (h * 0.98 - p[1]) * A.rand(0.5, 0.16);
              const ang = 1.34 + A.rand(0.30, -0.26);
              const ex = p[0] + Math.cos(ang) * len * 0.45, ey = p[1] + Math.sin(ang) * len;
              B.stroke(g, [[p[0] + A.rand(5, -5), p[1] + A.rand(3, 1)], [ex, ey]], {
                width: A.rand(10, 4), alpha: A.rand(0.16, 0.04), taper: true, jitter: 1.0,
              });
            }
          }
          g.restore();

          // 山脊：一整条，再压几笔重墨
          if (!back) {
            B.stroke(g, P.slice(2, -2), { width: A.rand(13, 9), alpha: 0.76, taper: false, jitter: 1.2 });
            for (let i = 0; i < 5; i++) {
              const i0 = 30 + Math.floor(A.rand(P.length - 70));
              const q = P.slice(i0, i0 + 14);
              B.stroke(g, q, { width: A.rand(20, 12), alpha: A.rand(0.8, 0.5), taper: false, jitter: 0.7 });
            }
          }
        };

        layer([[-0.02, 1.0], [0.12, 0.80], [0.22, 0.62], [0.32, 0.70], [0.42, 0.40], [0.52, 0.52], [0.64, 0.34],
          [0.74, 0.58], [0.86, 0.74], [1.02, 1.0]], 0.055, true);
        layer([[-0.02, 1.02], [0.10, 0.86], [0.18, 0.66], [0.24, 0.70], [0.30, 0.48], [0.36, 0.42], [0.42, 0.18],
          [0.47, 0.30], [0.51, 0.24], [0.56, 0.38], [0.62, 0.34], [0.68, 0.50], [0.75, 0.62], [0.88, 0.86], [1.02, 1.02]], 0.16, false);

        // 山脚淡出
        g.globalCompositeOperation = 'destination-out';
        const bg = g.createLinearGradient(0, h * 0.9, 0, h);
        bg.addColorStop(0, 'rgba(0,0,0,0)');
        bg.addColorStop(1, 'rgba(0,0,0,0.45)');
        g.fillStyle = bg;
        g.fillRect(0, h * 0.9, w, h * 0.1);
        g.globalCompositeOperation = 'source-over';
      });
    }
    render(ctx) {
      const s = this.k;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2, this.y - this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 石 ----------
  A.ENTITIES['石'] = class Rock extends Entity {
    constructor(...a) {
      super(...a);
      this.W = 220; this.H = 180;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        g.beginPath();
        [[0.12, 0.95], [0.05, 0.62], [0.22, 0.24], [0.46, 0.12], [0.52, 0.34], [0.72, 0.30], [0.9, 0.55], [0.86, 0.92], [0.45, 1]]
          .forEach((p, i) => i ? g.lineTo(p[0] * w, p[1] * h) : g.moveTo(p[0] * w, p[1] * h));
        g.closePath();
        const lg = g.createLinearGradient(0, 0, w, h);
        lg.addColorStop(0, 'rgba(20,28,30,0.16)');
        lg.addColorStop(0.6, 'rgba(20,28,30,0.10)');
        lg.addColorStop(1, 'rgba(20,28,30,0.04)');
        g.fillStyle = lg; g.fill();
        const out = [[0.10, 0.66], [0.06, 0.50], [0.20, 0.28], [0.34, 0.18], [0.46, 0.14], [0.50, 0.34], [0.62, 0.34], [0.78, 0.44], [0.89, 0.60], [0.86, 0.88]];
        for (let i = 0; i < out.length - 1; i++) {
          const a = out[i], b = out[i + 1];
          B.stroke(g, line(a[0] * w, a[1] * h, b[0] * w, b[1] * h), { width: A.rand(13, 7), alpha: 0.66 });
        }
        for (let i = 0; i < 34; i++) {
          const x = A.rand(w * 0.9) + w * 0.05, y = A.rand(h * 0.7) + h * 0.2;
          B.stroke(g, line(x, y, x + A.rand(14, -6), y + A.rand(20, 6)), { width: A.rand(6, 2), alpha: A.rand(0.3, 0.1) });
        }
      });
    }
    render(ctx) {
      const s = this.k * 0.9;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2, this.y - this.H * s * 0.88, this.W * s, this.H * s);
    }
  };

  // ---------- 一脉水 ----------
  A.ENTITIES['水'] = class Water extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 1.5;
      this.W = 720; this.H = 150;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        B.wash(g, w / 2, h * 0.55, w * 0.46, h * 0.26, 0.035);
        for (let i = 0; i < 13; i++) {
          const y = h * (0.30 + i * 0.045) + A.rand(5, -5);
          const len = A.rand(w * 0.55, w * 0.18);
          const x0 = w * 0.5 - len / 2 + A.rand(w * 0.05, -w * 0.05);
          const pts = quad(x0, y, x0 + len * 0.5, y + A.rand(7, -7), x0 + len, y, 14);
          B.stroke(g, pts, { width: A.rand(7, 2.5), alpha: A.rand(0.44, 0.16) });
        }
        // 水口微光
        for (let i = 0; i < 8; i++) {
          const x = w * A.rand(0.85, 0.15), y = h * A.rand(0.75, 0.3);
          B.stroke(g, line(x, y, x + A.rand(26, 8), y), { width: A.rand(3, 1.2), alpha: 0.2 });
        }
      });
    }
    render(ctx) {
      const s = this.k;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2, this.y - this.H * s * 0.45, this.W * s, this.H * s);
    }
  };

  // ---------- 竹 ----------
  A.ENTITIES['竹'] = class Bamboo extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 2.1;
      this.W = 250; this.H = 440;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        const stalks = [
          { x: w * 0.20, top: h * 0.06, bend: -10, wd: 13 },
          { x: w * 0.44, top: h * 0.13, bend: 6, wd: 11 },
          { x: w * 0.66, top: h * 0.24, bend: 12, wd: 9 },
          { x: w * 0.84, top: h * 0.40, bend: 15, wd: 7 },
        ];
        stalks.forEach((st, si) => {
          const baseY = h * 1.02;
          const pts = quad(st.x, baseY, st.x + st.bend * 0.35, (baseY + st.top) / 2, st.x + st.bend, st.top, 22);
          B.stroke(g, pts, { width: st.wd * 1.15, alpha: 0.78, taper: true, jitter: 0.9 });
          // 竹节：一道横笔，上重下轻
          for (let k = 1; k < 6; k++) {
            const i0 = Math.round(pts.length * (k / 6)) - 1;
            const p = pts[Math.min(pts.length - 1, i0)];
            const q = pts[Math.min(pts.length - 1, i0 + 1)];
            const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + 1.5708;
            B.stroke(g, line(p[0] - Math.cos(ang) * st.wd * 0.55, p[1] - Math.sin(ang) * st.wd * 0.55,
              p[0] + Math.cos(ang) * st.wd * 0.55, p[1] + Math.sin(ang) * st.wd * 0.55), {
              width: 3.2, alpha: 0.55, taper: false,
            });
            B.dab(g, p[0], p[1] - 3, st.wd * 0.5, Math.atan2(q[1] - p[1], q[0] - p[0]), 0.25, 1.3);
          }
          // 枝、叶
          for (let b = 0; b < 5; b++) {
            const t = 0.16 + b * 0.165;
            const i0 = Math.round(pts.length * t);
            const p0 = pts[Math.min(pts.length - 1, i0)];
            const dir = si % 2 === 0 ? (b % 2 === 0 ? -1 : 1) : (b % 2 === 0 ? 1 : -1);
            const bx = p0[0] + dir * A.rand(56, 26), by = p0[1] - A.rand(26, 6);
            B.stroke(g, quad(p0[0], p0[1], p0[0] + dir * 18, p0[1] - 18, bx, by, 8), { width: 2.8, alpha: 0.5 });
            // 叶：从枝端散开，向下方垂
            const n = 3 + (b % 3);
            for (let l = 0; l < n; l++) {
              const spread = -0.5 + l * (1.0 / Math.max(1, n - 1));
              const base = dir > 0 ? (0.34 + A.rand(0.3)) : (Math.PI - 0.34 - A.rand(0.3));
              const ang = base + spread * 0.75 + A.rand(0.12, -0.12);
              const len = A.rand(58, 34);
              B.leaf(g, bx + A.rand(8, -8), by + A.rand(6, -4), len, A.rand(10, 6), ang, A.rand(0.82, 0.55));
            }
            if (b === 4) {
              for (let l = 0; l < 3; l++) {
                const ang = (dir > 0 ? 0.5 : Math.PI - 0.5) + A.rand(0.6, -0.6);
                B.leaf(g, p0[0] + dir * A.rand(16, 4), p0[1] - A.rand(10, 2), A.rand(48, 30), A.rand(9, 6), ang, 0.7);
              }
            }
          }
          // 竿上的小叶
          for (let l = 0; l < 3; l++) {
            const p = pts[Math.round(pts.length * A.rand(0.93, 0.7))];
            const ang = A.rand(0.8, -0.8) + 1.57;
            B.leaf(g, p[0], p[1], A.rand(34, 20), A.rand(10, 6), ang, 0.55);
          }
        });
      });
    }
    render(ctx, e) {
      const s = this.k;
      const sway = this.world.wind.x * 0.035 + Math.sin(this.age * 1.1 + this.seed) * 0.014;
      ctx.translate(this.x, this.y);
      ctx.rotate(sway * 0.7);
      ctx.scale(1, 0.94 + 0.06 * e);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 松 ----------
  A.ENTITIES['松'] = class Pine extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 2.1;
      this.W = 360; this.H = 400;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        // 主干
        const trunk = [[0.50, 1], [0.48, 0.78], [0.40, 0.58], [0.38, 0.40], [0.30, 0.22]];
        B.stroke(g, trunk.map(p => [p[0] * w, p[1] * h]), { width: 18, alpha: 0.72 });
        for (let i = 0; i < 4; i++) {
          const p = trunk[i + 1];
          B.stroke(g, line(p[0] * w, p[1] * h, (p[0] + A.rand(0.2, -0.2)) * w, (p[1] - A.rand(0.08, -0.02)) * h), {
            width: A.rand(9, 4), alpha: 0.6,
          });
        }
        // 松针团
        const cl = [[0.26, 0.24], [0.46, 0.38], [0.66, 0.50], [0.32, 0.56], [0.62, 0.28]];
        cl.forEach((c, ci) => {
          const cx = c[0] * w, cy = c[1] * h;
          B.wash(g, cx, cy, 38, 26, 0.035);
          for (let i = 0; i < 34; i++) {
            const ang = A.rand(6.283), len = A.rand(36, 12);
            B.stroke(g, line(cx, cy, cx + Math.cos(ang) * len * 1.6, cy + Math.sin(ang) * len), {
              width: A.rand(4, 1.4), alpha: A.rand(0.5, 0.2),
            });
          }
        });
        // 树根
        B.stroke(g, line(w * 0.50, h * 0.99, w * 0.36, h), { width: 6, alpha: 0.5 });
        B.stroke(g, line(w * 0.50, h * 0.99, w * 0.66, h), { width: 6, alpha: 0.5 });
      });
    }
    render(ctx) {
      const s = this.k;
      const sway = this.world.wind.x * 0.02 + Math.sin(this.age * 0.9 + this.seed) * 0.01;
      ctx.translate(this.x, this.y);
      ctx.rotate(sway * 0.5);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 梅 ----------
  A.ENTITIES['梅'] = class Plum extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 2.15;
      this.W = 340; this.H = 320;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        // 折枝
        const br = [[0.06, 0.95], [0.28, 0.80], [0.34, 0.62], [0.30, 0.45], [0.44, 0.32], [0.42, 0.20], [0.56, 0.16], [0.62, 0.06]];
        for (let i = 0; i < br.length - 1; i++) {
          B.stroke(g, line(br[i][0] * w, br[i][1] * h, br[i + 1][0] * w, br[i + 1][1] * h), {
            width: A.rand(15, 6) - i, alpha: 0.7,
          });
        }
        // 侧枝
        const side = [[0.34, 0.62], [0.62, 0.70], [0.72, 0.58], [0.90, 0.52]];
        for (let i = 0; i < side.length - 1; i++) {
          B.stroke(g, line(side[i][0] * w, side[i][1] * h, side[i + 1][0] * w, side[i + 1][1] * h), {
            width: A.rand(7, 3), alpha: 0.6,
          });
        }
        // 墨梅：五瓣用细线圈出
        const blossoms = [[0.44, 0.30], [0.40, 0.20], [0.56, 0.14], [0.63, 0.06], [0.70, 0.55], [0.82, 0.49], [0.90, 0.53], [0.30, 0.50]];
        blossoms.forEach((bp) => {
          const bx = bp[0] * w, by = bp[1] * h, r = A.rand(11, 6);
          for (let p = 0; p < 5; p++) {
            const ang = p * 1.256 + A.rand(0.3);
            const px = bx + Math.cos(ang) * r * 0.9, py = by + Math.sin(ang) * r * 0.9;
            g.strokeStyle = B.INK(0.7);
            g.lineWidth = 1.5;
            g.beginPath();
            g.ellipse(px, py, r * 0.62, r * 0.52, ang, 0, 6.283);
            g.stroke();
          }
          g.fillStyle = B.INK(0.45);
          for (let p = 0; p < 3; p++) {
            g.beginPath(); g.arc(bx + A.rand(3, -3), by + A.rand(3, -3), 1.2, 0, 6.283); g.fill();
          }
        });
      });
    }
    render(ctx) {
      const s = this.k * 0.95;
      const sway = this.world.wind.x * 0.018 + Math.sin(this.age * 1.2 + this.seed) * 0.01;
      ctx.translate(this.x, this.y);
      ctx.rotate(sway);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 柳 ----------
  A.ENTITIES['柳'] = class Willow extends Entity {
    constructor(...a) {
      super(...a);
      this.W = 300; this.H = 420;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        const trunk = quad(w * 0.52, h, w * 0.50, h * 0.62, w * 0.46, h * 0.34, 16);
        B.stroke(g, trunk, { width: 16, alpha: 0.65 });
        for (let i = 0; i < 5; i++) {
          const p = trunk[Math.round(trunk.length * (0.55 + i * 0.09))];
          const dir = i % 2 ? 1 : -1;
          B.stroke(g, quad(p[0], p[1], p[0] + dir * 40, p[1] - 26, p[0] + dir * A.rand(88, 56), p[1] - A.rand(48, 22), 10), {
            width: A.rand(6, 3), alpha: 0.55,
          });
        }
        // 垂柳丝
        for (let i = 0; i < 26; i++) {
          const x0 = w * A.rand(0.86, 0.16), y0 = h * A.rand(0.36, 0.16);
          const len = A.rand(h * 0.55, h * 0.2);
          const bend = A.rand(24, -24);
          const pts = quad(x0, y0, x0 + bend, y0 + len * 0.5, x0 + bend * 0.4, y0 + len, 22);
          B.stroke(g, pts, { width: A.rand(2.4, 1.1), alpha: A.rand(0.55, 0.25), taper: true });
          for (let l = 0; l < 4; l++) {
            const q = pts[Math.round(A.rand(pts.length - 1))];
            B.dab(g, q[0] + A.rand(4, -4), q[1], A.rand(4, 2), A.rand(6.28), A.rand(0.35, 0.14), 1.8);
          }
        }
      });
    }
    render(ctx) {
      const s = this.k;
      const sway = this.world.wind.x * 0.03 + Math.sin(this.age * 1.35 + this.seed) * 0.02;
      ctx.translate(this.x, this.y);
      ctx.rotate(sway * 0.8);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 荷 ----------
  A.ENTITIES['荷'] = class Lotus extends Entity {
    constructor(...a) {
      super(...a);
      this.W = 320; this.H = 340;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        // 叶
        const leaves = [[0.28, 0.62, 0.22, 0.10], [0.68, 0.74, 0.28, 0.13]];
        leaves.forEach(([cx, cy, rx, ry]) => {
          B.wash(g, cx * w, cy * h, rx * w, ry * h, 0.055);
          g.strokeStyle = B.INK(0.55); g.lineWidth = 2.2;
          g.beginPath(); g.ellipse(cx * w, cy * h, rx * w * 0.98, ry * h * 0.98, 0.05, 0, 6.283); g.stroke();
          for (let i = 0; i < 12; i++) {
            const ang = i / 12 * 6.283 + A.rand(0.2);
            B.stroke(g, line(cx * w, cy * h, cx * w + Math.cos(ang) * rx * w * 0.9, cy * h + Math.sin(ang) * ry * h * 0.9), {
              width: 1.3, alpha: 0.32,
            });
          }
        });
        // 花茎
        B.stroke(g, quad(w * 0.52, h * 0.96, w * 0.56, h * 0.72, w * 0.62, h * 0.42, 12), { width: 5, alpha: 0.55 });
        // 荷花
        const fx = w * 0.62, fy = h * 0.36;
        for (let i = 0; i < 9; i++) {
          const ang = -1.57 + (i - 4) * 0.28;
          const len = A.rand(54, 34);
          B.stroke(g, quad(fx, fy, fx + Math.cos(ang) * len * 0.7, fy + Math.sin(ang) * len * 0.7,
            fx + Math.cos(ang) * len, fy + Math.sin(ang) * len * 1.1, 10), {
            width: A.rand(12, 7), alpha: A.rand(0.75, 0.45),
          });
        }
        B.dab(g, fx, fy, 10, 0, 0.6);
        // 水纹
        for (let i = 0; i < 5; i++) {
          const y = h * (0.86 + i * 0.02);
          B.stroke(g, quad(w * 0.1, y, w * 0.4, y + A.rand(5, -5), w * 0.9, y, 12), { width: 2.4, alpha: 0.2 });
        }
      });
    }
    render(ctx) {
      const s = this.k;
      const sway = this.world.wind.x * 0.02 + Math.sin(this.age * 1.2 + this.seed) * 0.015;
      ctx.translate(this.x, this.y);
      ctx.rotate(sway * 0.6);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 菊 ----------
  A.ENTITIES['菊'] = class Chrys extends Entity {
    constructor(...a) {
      super(...a);
      this.W = 220; this.H = 300;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        B.stroke(g, quad(w * 0.5, h * 0.98, w * 0.46, h * 0.7, w * 0.5, h * 0.42, 12), { width: 4.5, alpha: 0.55 });
        for (let i = 0; i < 4; i++) {
          const y = h * (0.6 + i * 0.09), dir = i % 2 ? 1 : -1;
          const pts = quad(w * 0.5, y, w * 0.5 + dir * 26, y - 16, w * 0.5 + dir * 50, y - 8, 8);
          B.stroke(g, pts, { width: 3.2, alpha: 0.5 });
          B.dab(g, w * 0.5 + dir * 50, y - 8, 7, 0, 0.4, 2.2);
        }
        const cx = w * 0.5, cy = h * 0.34;
        for (let ring = 0; ring < 3; ring++) {
          const n = 18 + ring * 6, len = 34 - ring * 8;
          for (let i = 0; i < n; i++) {
            const ang = i / n * 6.283 + ring * 0.2;
            const r0 = 8 + ring * 9;
            B.stroke(g, quad(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0,
              cx + Math.cos(ang) * (r0 + len * 0.6), cy + Math.sin(ang) * (r0 + len * 0.6),
              cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len), 6), {
              width: A.rand(4, 1.8), alpha: A.rand(0.6, 0.28),
            });
          }
        }
        B.dab(g, cx, cy, 11, 0, 0.5);
      });
    }
    render(ctx) {
      const s = this.k;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.world.wind.x * 0.01 + Math.sin(this.age * 1.4 + this.seed) * 0.01);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 兰 ----------
  A.ENTITIES['兰'] = class Orchid extends Entity {
    constructor(...a) {
      super(...a);
      this.W = 280; this.H = 240;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        for (let i = 0; i < 4; i++) {
          const x0 = w * 0.5, y0 = h * 0.98;
          const dir = i % 2 ? 1 : -1;
          const sway = A.rand(w * 0.42, w * 0.12) * dir;
          const pts = quad(x0, y0, x0 + sway * 0.4, y0 - h * 0.55, x0 + sway, y0 - A.rand(h * 0.9, h * 0.3), 22);
          B.stroke(g, pts, { width: A.rand(11, 4), alpha: A.rand(0.65, 0.3) });
        }
        const fx = w * 0.36, fy = h * 0.30;
        for (let i = 0; i < 5; i++) {
          const ang = A.rand(6.28);
          B.stroke(g, quad(fx, fy, fx + Math.cos(ang) * 12, fy + Math.sin(ang) * 12, fx + Math.cos(ang) * 22, fy + Math.sin(ang) * 22, 6), { width: 6, alpha: 0.5 });
        }
        B.dab(g, fx, fy, 4, 0, 0.55);
      });
    }
    render(ctx) {
      const s = this.k * 0.92;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.world.wind.x * 0.025 + Math.sin(this.age * 1.3 + this.seed) * 0.015);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 亭 ----------
  A.ENTITIES['亭'] = class Pavilion extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 2.3;
      this.W = 300; this.H = 260;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        // 屋顶
        const roofY = h * 0.26;
        B.stroke(g, quad(w * 0.08, roofY + h * 0.12, w * 0.2, roofY - h * 0.06, w * 0.5, roofY, 16), { width: 13, alpha: 0.75 });
        B.stroke(g, quad(w * 0.5, roofY, w * 0.8, roofY - h * 0.06, w * 0.92, roofY + h * 0.12, 16), { width: 13, alpha: 0.75 });
        B.stroke(g, line(w * 0.5, roofY - h * 0.10, w * 0.5, roofY - h * 0.02), { width: 5, alpha: 0.7 });
        B.dab(g, w * 0.5, roofY - h * 0.11, 5, 0, 0.7);
        // 檐角上翘
        B.stroke(g, quad(w * 0.08, roofY + h * 0.12, w * 0.02, roofY + h * 0.16, w * 0.05, roofY + h * 0.06, 6), { width: 4, alpha: 0.6 });
        B.stroke(g, quad(w * 0.92, roofY + h * 0.12, w * 0.98, roofY + h * 0.16, w * 0.95, roofY + h * 0.06, 6), { width: 4, alpha: 0.6 });
        // 柱
        for (const px of [0.3, 0.5, 0.7]) {
          B.stroke(g, line(px * w, roofY + h * 0.10, px * w, h * 0.86), { width: px === 0.5 ? 7 : 6, alpha: 0.62 });
        }
        // 台基
        B.stroke(g, line(w * 0.22, h * 0.88, w * 0.78, h * 0.88), { width: 9, alpha: 0.55 });
        B.stroke(g, line(w * 0.18, h * 0.93, w * 0.82, h * 0.93), { width: 5, alpha: 0.4 });
        // 栏杆
        for (let i = 0; i < 4; i++) {
          const x = w * (0.24 + i * 0.08);
          B.stroke(g, line(x, h * 0.86, x, h * 0.92), { width: 2, alpha: 0.35 });
        }
      });
    }
    render(ctx) {
      const s = this.k;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2, this.y - this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 舟 ----------
  A.ENTITIES['舟'] = class Boat extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 2.6;
      this.W = 260; this.H = 130;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        // 船身
        B.stroke(g, quad(w * 0.06, h * 0.52, w * 0.3, h * 0.72, w * 0.5, h * 0.72, 14), { width: 11, alpha: 0.7 });
        B.stroke(g, quad(w * 0.5, h * 0.72, w * 0.72, h * 0.72, w * 0.94, h * 0.48, 14), { width: 11, alpha: 0.7 });
        B.stroke(g, quad(w * 0.06, h * 0.60, w * 0.5, h * 0.64, w * 0.94, h * 0.58, 12), { width: 5, alpha: 0.55 });
        // 篷
        B.stroke(g, quad(w * 0.34, h * 0.62, w * 0.34, h * 0.34, w * 0.50, h * 0.32, 10), { width: 5.5, alpha: 0.62 });
        B.stroke(g, quad(w * 0.50, h * 0.32, w * 0.66, h * 0.34, w * 0.66, h * 0.62, 10), { width: 5.5, alpha: 0.62 });
        B.stroke(g, line(w * 0.34, h * 0.48, w * 0.66, h * 0.48), { width: 3, alpha: 0.35 });
        // 篙
        B.stroke(g, line(w * 0.80, h * 0.2, w * 0.60, h * 0.75), { width: 3, alpha: 0.5 });
        // 水影
        for (let i = 0; i < 2; i++) {
          B.stroke(g, quad(w * 0.14, h * (0.82 + i * 0.04), w * 0.5, h * (0.84 + i * 0.04), w * 0.86, h * (0.82 + i * 0.04), 10), { width: 2, alpha: 0.14 });
        }
      });
    }
    render(ctx) {
      const s = this.k * 0.9;
      const bob = Math.sin(this.age * 1.4 + this.seed) * 4;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2 + this.world.wind.x * this.age * 4, this.y - this.H * s * 0.7 + bob, this.W * s, this.H * s);
    }
  };

  // ---------- 月 ----------
  A.ENTITIES['月'] = class Moon extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 0.5;
      this.W = 300; this.H = 300;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        // 只在月轮内留一点极淡的湿气
        B.wash(g, w / 2, h / 2, w * 0.20, h * 0.20, 0.03);
        // 月轮：一圈虚笔
        const R = w * 0.21;
        const pts = [];
        for (let i = 0; i <= 72; i++) {
          const a = i / 72 * 6.283;
          const rr = R * (1 + Math.sin(a * 5 + 1.2) * 0.012);
          pts.push([w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr]);
        }
        B.stroke(g, pts, { width: 4.2, alpha: 0.42, taper: false, jitter: 0.4 });
        // 月边云丝
        for (let i = 0; i < 2; i++) {
          const y = h * (0.52 + i * 0.075);
          B.stroke(g, quad(w * 0.02, y + 8, w * 0.4, y - 8, w * 0.98, y + 6, 16), { width: 5, alpha: 0.13, taper: true });
        }
      });
    }
    render(ctx) {
      const s = this.k;
      const drift = Math.sin(this.age * 0.3 + this.seed) * 6;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2 + drift, this.y - this.H * s / 2, this.W * s, this.H * s);
    }
  };

  // ---------- 云 ----------
  A.ENTITIES['云'] = class Cloud extends Entity {
    constructor(...a) {
      super(...a);
      this.z = 0.6;
      this.W = 420; this.H = 200;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        for (let i = 0; i < 5; i++) {
          const x = w * (0.18 + i * 0.16), y = h * (0.45 + Math.sin(i) * 0.12);
          B.wash(g, x, y, A.rand(70, 40), A.rand(38, 22), 0.06);
        }
        // 卷云勾线
        B.stroke(g, quad(w * 0.12, h * 0.58, w * 0.24, h * 0.32, w * 0.40, h * 0.40, 12), { width: 5, alpha: 0.32 });
        B.stroke(g, quad(w * 0.52, h * 0.66, w * 0.68, h * 0.42, w * 0.86, h * 0.52, 12), { width: 4, alpha: 0.28 });
        B.stroke(g, quad(w * 0.30, h * 0.70, w * 0.56, h * 0.54, w * 0.78, h * 0.68, 12), { width: 3, alpha: 0.2 });
      });
      this.drift = A.rand(0.5, 0.1) * (Math.random() < 0.5 ? 1 : -1);
      this.rainAt = -1;
    }
    update(dt) {
      super.update(dt);
      this.x += (this.drift + this.world.wind.x * 0.12) * dt * 6;
      this.y += this.world.wind.y * 0.02 * dt * 60;
      if (this.x < -200 || this.x > this.world.w + 200) this.x = this.x < 0 ? this.world.w + 100 : -100;
      if (this.world.clouds >= 2 && this.rainAt < 0 && this.age > 4) {
        this.rainAt = this.age;
        this.world.spawnWeather('雨', this.x, this.y + 120);
        A.toast('云聚，雨落');
      }
    }
    render(ctx) {
      const s = this.k * 1.1;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2, this.y - this.H * s * 0.55, this.W * s, this.H * s);
    }
  };

  // ---------- 灯 ----------
  A.ENTITIES['灯'] = class Lantern extends Entity {
    constructor(...a) {
      super(...a);
      this.W = 120; this.H = 170;
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        // 竹竿
        B.stroke(g, line(w * 0.5, h * 0.02, w * 0.5, h * 0.22), { width: 3, alpha: 0.5 });
        // 红灯笼
        g.fillStyle = 'rgba(150,42,32,0.72)';
        g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.22, h * 0.22, 0, 0, 6.283); g.fill();
        g.strokeStyle = B.INK(0.7); g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.22, h * 0.22, 0, 0, 6.283); g.stroke();
        // 灯骨
        for (let i = -2; i <= 2; i++) {
          g.strokeStyle = B.INK(0.35); g.lineWidth = 1.2;
          g.beginPath(); g.ellipse(w * 0.5, h * 0.5, Math.abs(i) * 8 + 2, h * 0.22, 0, 0, 6.283); g.stroke();
        }
        // 上下缘与穗
        g.fillStyle = B.INK(0.65);
        g.fillRect(w * 0.42, h * 0.26, w * 0.16, h * 0.04);
        g.fillRect(w * 0.42, h * 0.70, w * 0.16, h * 0.04);
        for (let i = 0; i < 5; i++) B.stroke(g, line(w * (0.44 + i * 0.03), h * 0.74, w * (0.44 + i * 0.03), h * (0.86 + A.rand(0.06)), 6), { width: 1.6, alpha: 0.4 });
      });
    }
    render(ctx) {
      const s = this.k;
      const glow = ctx.createRadialGradient(this.x, this.y - this.H * s * 0.5, 2, this.x, this.y - this.H * s * 0.5, this.W * s * 0.9);
      glow.addColorStop(0, 'rgba(255,180,120,0.18)');
      glow.addColorStop(1, 'rgba(255,180,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(this.x, this.y - this.H * s * 0.5, this.W * s * 0.9, 0, 6.283); ctx.fill();
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2, this.y - this.H * s, this.W * s, this.H * s);
    }
  };

  // ---------- 鱼 ----------
  A.ENTITIES['鱼'] = class Fish extends Entity {
    constructor(world, ch, x, y) {
      super(world, ch, x, y);
      this.z = 2.7;
      this.W = 190; this.H = 112;
      this.body = sprite(150, 88, (g, w, h) => {
        // 鱼身：一笔弧背，一笔浅腹
        const back = quad(w * 0.94, h * 0.56, w * 0.62, h * 0.20, w * 0.24, h * 0.46, 16);
        const belly = quad(w * 0.24, h * 0.50, w * 0.58, h * 0.80, w * 0.92, h * 0.60, 16);
        g.beginPath();
        back.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
        belly.forEach(p => g.lineTo(p[0], p[1]));
        g.closePath();
        const fg = g.createLinearGradient(0, h * 0.2, 0, h * 0.8);
        fg.addColorStop(0, 'rgba(18,26,28,0.22)');
        fg.addColorStop(1, 'rgba(18,26,28,0.05)');
        g.fillStyle = fg; g.fill();
        B.stroke(g, back, { width: 10, alpha: 0.82, taper: true });
        B.stroke(g, belly, { width: 5, alpha: 0.45, taper: true });
        // 尾鳍
        B.stroke(g, quad(w * 0.26, h * 0.47, w * 0.16, h * 0.30, w * 0.08, h * 0.34, 10), { width: 7, alpha: 0.55 });
        B.stroke(g, quad(w * 0.26, h * 0.53, w * 0.14, h * 0.70, w * 0.07, h * 0.66, 10), { width: 7, alpha: 0.55 });
        // 背鳍、胸鳍
        B.stroke(g, quad(w * 0.48, h * 0.26, w * 0.52, h * 0.12, w * 0.64, h * 0.24, 8), { width: 4, alpha: 0.45 });
        B.stroke(g, quad(w * 0.60, h * 0.56, w * 0.56, h * 0.70, w * 0.70, h * 0.66, 8), { width: 3.4, alpha: 0.4 });
        // 眼
        g.fillStyle = B.INK(0.9);
        g.beginPath(); g.arc(w * 0.84, h * 0.48, 3.2, 0, 6.283); g.fill();
      });
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.speed = A.rand(26, 12);
      this.cx = x; this.cy = y;
    }
    update(dt) {
      super.update(dt);
      const w = this.world;
      this.phase = (this.phase || 0) + dt * 2.2;
      this.cx += this.dir * this.speed * dt * (1 + w.wind.x * 0.25);
      this.cy += Math.sin(this.phase) * 14 * dt * 2;
      if (this.cx < 60) this.dir = 1;
      if (this.cx > this.world.w - 60) this.dir = -1;
      this.x = this.cx; this.y = this.cy;
      // 鱼游过墨面时，墨会轻轻散开
      if (Math.random() < 0.05) {
        const fluid = this.world.fluid;
        fluid.splatVelPx(this.cx, this.cy, this.dir * 1.2, 0, 46);
      }
    }
    render(ctx) {
      const s = this.k * 1.0;
      ctx.translate(this.x, this.y);
      ctx.scale(this.dir, 1);
      ctx.rotate(Math.sin((this.phase || 0)) * 0.06);
      ctx.drawImage(this.body.canvas, -this.W * s / 2, -this.H * s / 2, this.W * s, this.H * s);
    }
  };

  // ---------- 鹤 ----------
  A.ENTITIES['鹤'] = class Crane extends Entity {
    constructor(world, ch, x, y) {
      super(world, ch, x, y);
      this.z = 3.1;
      this.W = 260; this.H = 160;
      this.body = sprite(200, 140, (g, w, h) => {
        g.beginPath();
        g.ellipse(w * 0.44, h * 0.58, w * 0.24, h * 0.16, -0.12, 0, 6.283);
        g.fillStyle = 'rgba(20,28,30,0.18)'; g.fill();
        B.stroke(g, quad(w * 0.62, h * 0.50, w * 0.80, h * 0.30, w * 0.86, h * 0.14, 12), { width: 6, alpha: 0.7 });
        B.stroke(g, quad(w * 0.86, h * 0.14, w * 0.92, h * 0.12, w * 0.94, h * 0.18, 6), { width: 4, alpha: 0.7 });
        B.dab(g, w * 0.86, h * 0.14, 4, 0, 0.8);
        // 腿
        B.stroke(g, line(w * 0.46, h * 0.7, w * 0.44, h * 0.95), { width: 2.4, alpha: 0.5 });
        B.stroke(g, line(w * 0.52, h * 0.7, w * 0.54, h * 0.95), { width: 2.4, alpha: 0.5 });
      });
      this.wings = [];
      for (let f = 0; f < 5; f++) {
        this.wings.push(sprite(140, 140, (g, w, h) => {
          const flap = f / 4;
          const tipY = h * (0.10 + flap * 0.30);
          const pts = quad(w * 0.92, h * 0.72, w * 0.5, h * 0.10, w * 0.06, tipY, 12);
          B.stroke(g, pts, { width: 9, alpha: 0.5 });
          for (let i = 0; i < 4; i++) {
            const t = 0.2 + i * 0.1;
            const p = pts[Math.round(pts.length * t)];
            B.stroke(g, line(p[0], p[1], p[0] - A.rand(26, 8), p[1] + A.rand(24, 6)), { width: A.rand(4, 2), alpha: 0.35 });
          }
        }));
      }
      this.phase = A.rand(6.28);
      this.vx = A.rand(40, 20) * (Math.random() < 0.5 ? 1 : -1);
      this.vy = A.rand(14, -14);
    }
    update(dt) {
      super.update(dt);
      this.phase += dt * 2.4;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < 80) this.vx = Math.abs(this.vx);
      if (this.x > this.world.w - 80) this.vx = -Math.abs(this.vx);
      if (this.y < 80) this.vy = Math.abs(this.vy);
      if (this.y > this.world.h * 0.7) this.vy = -Math.abs(this.vy);
      if (Math.random() < 0.03) this.world.fluid.splatVelPx(this.x, this.y, this.vx * 0.6, this.vy * 0.6, 60);
    }
    render(ctx) {
      const s = this.k * 0.9;
      ctx.translate(this.x, this.y);
      ctx.scale(this.vx > 0 ? 1 : -1, 1);
      ctx.drawImage(this.body.canvas, -this.W * s * 0.5, -this.H * s * 0.5, this.W * s, this.H * s);
      const wing = this.wings[Math.floor((Math.sin(this.phase) * 0.5 + 0.5) * 4.99)];
      ctx.drawImage(wing.canvas, -this.W * s * 0.62, -this.H * s * 0.62, 150 * s, 150 * s);
    }
  };

  // ---------- 鸟 ----------
  A.ENTITIES['鸟'] = class Bird extends Entity {
    constructor(world, ch, x, y) {
      super(world, ch, x, y);
      this.z = 3.0;
      this.W = 90; this.H = 60;
      this.spr = sprite(80, 50, (g, w, h) => {
        B.stroke(g, quad(w * 0.05, h * 0.62, w * 0.30, h * 0.30, w * 0.52, h * 0.55, 10), { width: 4.5, alpha: 0.65 });
        B.stroke(g, quad(w * 0.52, h * 0.55, w * 0.74, h * 0.30, w * 0.95, h * 0.62, 10), { width: 4.5, alpha: 0.65 });
        B.dab(g, w * 0.5, h * 0.58, 5, 0, 0.6);
        B.stroke(g, line(w * 0.52, h * 0.6, w * 0.62, h * 0.76), { width: 2, alpha: 0.5 });
      });
      this.vx = A.rand(50, 25) * (Math.random() < 0.5 ? 1 : -1);
      this.vy = A.rand(6, -6);
      this.phase = A.rand(6.28);
    }
    update(dt) {
      super.update(dt);
      this.phase += dt * 4;
      this.x += (this.vx + this.world.wind.x * 0.15) * dt;
      this.y += this.vy * dt;
      if (this.x < 30) this.vx = Math.abs(this.vx);
      if (this.x > this.world.w - 30) this.vx = -Math.abs(this.vx);
      this.y = A.clamp(this.y, 30, this.world.h * 0.6);
    }
    render(ctx) {
      const s = this.k * 0.75 * (1 + Math.sin(this.phase) * 0.03);
      ctx.translate(this.x, this.y);
      ctx.scale(this.vx > 0 ? 1 : -1, 1);
      ctx.rotate(Math.sin(this.phase) * 0.05);
      ctx.drawImage(this.spr.canvas, -this.W * s / 2, -this.H * s / 2, this.W * s, this.H * s);
    }
  };

  // ---------- 蝶 ----------
  A.ENTITIES['蝶'] = class Butterfly extends Entity {
    constructor(world, ch, x, y) {
      super(world, ch, x, y);
      this.z = 3.2;
      this.W = 100; this.H = 90;
      this.left = sprite(50, 60, (g, w, h) => {
        B.stroke(g, quad(w * 0.95, h * 0.55, w * 0.5, h * 0.08, w * 0.12, h * 0.30, 10), { width: 4, alpha: 0.6 });
        B.stroke(g, quad(w * 0.95, h * 0.55, w * 0.5, h * 0.92, w * 0.18, h * 0.82, 10), { width: 3, alpha: 0.45 });
      });
      this.phase = A.rand(6.28);
      this.cx = x; this.cy = y;
    }
    update(dt) {
      super.update(dt);
      this.phase += dt * 8;
      const t = this.age;
      this.cx += Math.sin(t * 0.9 + this.seed) * 24 * dt + this.world.wind.x * 0.1 * dt;
      this.cy += Math.cos(t * 1.1 + this.seed) * 16 * dt;
      this.cx = A.clamp(this.cx, 40, this.world.w - 40);
      this.cy = A.clamp(this.cy, 40, this.world.h - 60);
      this.x = this.cx; this.y = this.cy;
    }
    render(ctx) {
      const s = this.k * 0.8;
      const flap = Math.abs(Math.sin(this.phase)) * 0.9 + 0.1;
      ctx.translate(this.x, this.y);
      ctx.scale(flap, 1);
      ctx.drawImage(this.left.canvas, -this.W * s * 0.5, -this.H * s * 0.5, 50 * s, 60 * s);
      ctx.scale(-1, 1);
      ctx.drawImage(this.left.canvas, -this.W * s * 0.5, -this.H * s * 0.5, 50 * s, 60 * s);
    }
  };

  // ---------- 印 ----------
  A.ENTITIES['印'] = class Seal extends Entity {
    constructor(world, ch, x, y) {
      super(world, ch, x, y);
      this.z = 4;
      this.W = 120; this.H = 120;
      this.text = world.lastPhrase || '墨戏';
      this.spr = sprite(this.W, this.H, (g, w, h) => {
        const pad = 6;
        g.save();
        // 印面：不规则红块
        g.fillStyle = 'rgba(154,40,32,0.88)';
        g.beginPath();
        const r = 8;
        g.moveTo(pad + r, pad);
        g.lineTo(w - pad - r, pad); g.quadraticCurveTo(w - pad, pad, w - pad, pad + r);
        g.lineTo(w - pad, h - pad - r); g.quadraticCurveTo(w - pad, h - pad, w - pad - r, h - pad);
        g.lineTo(pad + r, h - pad); g.quadraticCurveTo(pad, h - pad, pad, h - pad - r);
        g.lineTo(pad, pad + r); g.quadraticCurveTo(pad, pad, pad + r, pad);
        g.closePath();
        g.fill();
        // 朱文：抠出字
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const txt = this.text.slice(-3);
        g.font = `${txt.length >= 3 ? 30 : 42}px ${B.FONT}`;
        if (txt.length >= 3) {
          g.fillText(txt[0], w * 0.5, h * 0.30);
          g.fillText(txt[1], w * 0.5, h * 0.56);
          g.fillText(txt[2], w * 0.5, h * 0.82);
        } else {
          g.fillText(txt, w * 0.5, h * 0.5);
        }
        g.restore();
        // 印边斑驳
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(0,0,0,${A.rand(0.5, 0.15)})`;
          g.beginPath(); g.arc(A.rand(w), A.rand(h), A.rand(3, 0.6), 0, 6.283); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      });
    }
    render(ctx) {
      const s = this.k * 0.85;
      ctx.drawImage(this.spr.canvas, this.x - this.W * s / 2, this.y - this.H * s / 2, this.W * s, this.H * s);
    }
  };

  // ---------- 天气：雨 ----------
  class Rain extends Entity {
    constructor(...a) {
      super(...a);
      this.kind = 'weather';
      this.z = 5;
      this.alpha = 0;
      this.drops = [];
      for (let i = 0; i < 180; i++) this.drops.push(this.newDrop(true));
      this.world.rainLevel += 0.6;
    }
    newDrop(init) {
      return {
        x: A.rand(this.world.w), y: init ? A.rand(this.world.h) : -A.rand(120, 10),
        len: A.rand(46, 14), speed: A.rand(620, 300), a: A.rand(0.42, 0.12),
      };
    }
    update(dt) {
      super.update(dt);
      this.alpha = Math.min(1, this.alpha + dt * 0.8);
      const wind = this.world.wind.x;
      for (const d of this.drops) {
        d.y += d.speed * dt;
        d.x += wind * d.speed * 0.012 * dt;
        if (d.y > this.world.h + 30) Object.assign(d, this.newDrop(false));
      }
      if (Math.random() < 0.25) {
        const d = this.drops[(Math.random() * this.drops.length) | 0];
        this.world.fluid.splatVelPx(d.x, d.y, wind * 0.6, 2.4, 14);
      }
    }
    render(ctx) {
      ctx.strokeStyle = B.INK(1);
      for (const d of this.drops) {
        ctx.globalAlpha = d.a * this.alpha;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + this.world.wind.x * 0.03 * d.len, d.y + d.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  A.ENTITIES['雨'] = Rain;

  // ---------- 天气：雪 ----------
  class Snow extends Entity {
    constructor(...a) {
      super(...a);
      this.kind = 'weather';
      this.z = 5;
      this.alpha = 0;
      this.flakes = [];
      for (let i = 0; i < 160; i++) this.flakes.push(this.newFlake(true));
      this.world.snowLevel += 0.5;
    }
    newFlake(init) {
      return { x: A.rand(this.world.w), y: init ? A.rand(this.world.h) : -A.rand(80, 10), r: A.rand(6.5, 2.8), sp: A.rand(90, 30), ph: A.rand(6.28), a: A.rand(0.55, 0.2) };
    }
    update(dt) {
      super.update(dt);
      this.alpha = Math.min(1, this.alpha + dt * 0.9);
      for (const f of this.flakes) {
        f.y += f.sp * dt;
        f.ph += dt * 1.5;
        f.x += Math.sin(f.ph) * 14 * dt + this.world.wind.x * 8 * dt;
        if (f.y > this.world.h + 10) Object.assign(f, this.newFlake(false));
      }
    }
    render(ctx) {
      for (const f of this.flakes) {
        ctx.globalAlpha = 0.14 * this.alpha;
        ctx.fillStyle = '#9aa8ab';
        ctx.beginPath(); ctx.arc(f.x + f.r * 0.4, f.y + f.r * 0.4, f.r * 1.0, 0, 6.283); ctx.fill();
        ctx.globalAlpha = f.a * this.alpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.85, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  A.ENTITIES['雪'] = Snow;

  // ---------- 天气：风 ----------
  class Wind extends Entity {
    constructor(...a) {
      super(...a);
      this.kind = 'weather';
      this.z = 0.8;
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.strength = A.rand(2.2, 1);
      this.lines = [];
      for (let i = 0; i < 8; i++) this.lines.push({ x: A.rand(this.world.w), y: A.rand(this.world.h * 0.8), len: A.rand(220, 80), ph: A.rand(6.28), a: A.rand(0.3, 0.12) });
    }
    update(dt) {
      super.update(dt);
      for (const l of this.lines) {
        l.x += this.dir * 40 * dt;
        if (l.x > this.world.w + 200) l.x = -200;
        if (l.x < -200) l.x = this.world.w + 200;
      }
    }
    render(ctx) {
      for (const l of this.lines) {
        const t = this.age * 0.6 + l.ph;
        ctx.strokeStyle = B.INK(l.a);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const y0 = l.y + Math.sin(t) * 16;
        ctx.moveTo(l.x, y0);
        ctx.bezierCurveTo(l.x + l.len * 0.3, y0 - 16, l.x + l.len * 0.6, y0 + 18, l.x + l.len, y0 + Math.sin(t + 1) * 10);
        ctx.stroke();
      }
    }
  }
  A.ENTITIES['风'] = Wind;

  // ---------- 天气：雾 ----------
  class Fog extends Entity {
    constructor(...a) {
      super(...a);
      this.kind = 'weather';
      this.z = 6;
      this.alpha = 0;
      this.bands = [];
      for (let i = 0; i < 4; i++) {
        this.bands.push({
          x: A.rand(this.world.w * 1.1, -this.world.w * 0.1),
          y: A.rand(this.world.h * 0.85, this.world.h * 0.15),
          rx: A.rand(this.world.w * 0.45, this.world.w * 0.18),
          ry: A.rand(this.world.h * 0.16, this.world.h * 0.06),
          sp: A.rand(0.9, 0.25) * (Math.random() < 0.5 ? -1 : 1),
          a: A.rand(0.55, 0.28),
          ph: A.rand(6.28),
        });
      }
      this.world.fogLevel += 0.5;
    }
    update(dt) {
      super.update(dt);
      this.alpha = Math.min(1, this.alpha + dt * 0.55);
      for (const b of this.bands) {
        b.x += b.sp * 8 * dt;
        if (b.x > this.world.w * 1.25) b.x = -this.world.w * 0.25;
        if (b.x < -this.world.w * 0.25) b.x = this.world.w * 1.25;
      }
    }
    render(ctx) {
      for (let i = 0; i < this.bands.length; i++) {
        const b = this.bands[i];
        const y = b.y + Math.sin(this.age * 0.18 + b.ph) * 10;
        const g = ctx.createRadialGradient(b.x, y, 1, b.x, y, b.rx);
        g.addColorStop(0, `rgba(224,226,220,${b.a * this.alpha})`);
        g.addColorStop(0.55, `rgba(232,232,226,${b.a * 0.55 * this.alpha})`);
        g.addColorStop(1, 'rgba(240,238,230,0)');
        ctx.save();
        ctx.translate(b.x, y);
        ctx.scale(1, b.ry / b.rx);
        ctx.translate(-b.x, -y);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, y, b.rx, 0, 6.283);
        ctx.fill();
        ctx.restore();
        // 淡墨云丝，纸上才看得见
        const yy = y + A.rand(b.ry * 0.35, -b.ry * 0.35);
        B.stroke(ctx, quad(b.x - b.rx * 0.9, yy + 8, b.x, yy - 14, b.x + b.rx * 0.9, yy + 5, 16), {
          width: A.rand(44, 26), alpha: 0.022 * this.alpha, taper: true, jitter: 2,
        });
      }
      // 几道横拖的淡墨雾丝
      for (let i = 0; i < 3; i++) {
        const y = this.world.h * (0.42 + i * 0.14) + Math.sin(this.age * 0.12 + i) * 12;
        ctx.globalAlpha = 0.10 * this.alpha;
        ctx.strokeStyle = 'rgba(90,104,106,1)';
        ctx.lineWidth = 26;
        ctx.beginPath();
        ctx.moveTo(-40, y);
        ctx.bezierCurveTo(this.world.w * 0.3, y - 24, this.world.w * 0.7, y + 26, this.world.w + 40, y - 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  A.ENTITIES['雾'] = Fog;

  // ---------- 天气：雷 ----------
  class Thunder extends Entity {
    constructor(...a) {
      super(...a);
      this.kind = 'weather';
      this.z = 6.5;
      this.peak = 0;
      this.phase = 0;
      this.strikes = [];
      this.world.thunderLevel += 1;
      this.world.shake = 1;
      this.world.fluid.splatVelPx(this.x, this.y, A.rand(16, -16), A.rand(16, -16), 220);
      this.world.blast(1.0);
    }
    update(dt) {
      super.update(dt);
      this.peak = Math.max(0, this.peak - dt * 1.4);
      if (this.age < 3) {
        this.peak = Math.max(this.peak, Math.max(0, 1 - Math.abs(this.age - 0.2) * 6));
        if (this.strikes.length < 2 && this.age > 0.3 + this.strikes.length * 0.55) this.strikes.push(A.rand(1));
      }
    }
    render(ctx) {
      if (this.peak > 0.01) {
        ctx.fillStyle = `rgba(255,252,240,${0.52 * this.peak})`;
        ctx.fillRect(0, 0, this.world.w, this.world.h);
      }
      for (let s = 0; s < this.strikes.length; s++) {
        const x0 = this.world.w * (0.25 + this.strikes[s] * 0.5), y0 = 0;
        ctx.strokeStyle = B.INK(0.55 * this.peak);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + A.rand(24, -24), this.world.h * 0.32);
        ctx.lineTo(x0 + A.rand(40, -40), this.world.h * 0.5);
        ctx.stroke();
      }
    }
  }
  A.ENTITIES['雷'] = Thunder;

  // ---------- 墨：一泼浓墨 ----------
  A.ENTITIES['墨'] = class InkBlot extends Entity {
    constructor(world, ch, x, y) {
      super(world, ch, x, y);
      this.kind = 'effect';
      this.z = 0.9;
      this.p = 0;
      const f = world.fluid;
      for (let i = 0; i < 26; i++) {
        const a = A.rand(6.283), r = A.rand(18);
        f.splatDye(x / world.w, 1 - y / world.h, A.rand(0.9, 0.3), A.rand(0.010, 0.002) + r * 0.00018);
        f.splatVelPx(x, y, Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4, 40);
      }
      A.toast('一泼浓墨');
      this.age = 99;
    }
    update() {}
    render() {}
  };

  // ---------- 生成 ----------
  A.makeEntity = function (ch, world, x, y) {
    const C = A.ENTITIES[ch];
    if (!C) return null;
    return new C(world, ch, x, y);
  };
})(window.INK);
