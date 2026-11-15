/* 墨戏 · 世界
 * 字落成墨，墨再生形；风、雨、云、雾彼此牵动。
 */
(function (A) {
  'use strict';

  const B = A.Brush;

  const RULES = [
    ['风', '竹', '风过竹梢，叶自摇'],
    ['风', '柳', '风起，柳丝斜'],
    ['雨', '竹', '雨打竹叶，声声慢'],
    ['雪', '梅', '梅雪争春'],
    ['鱼', '荷', '鱼戏莲叶间'],
    ['鹤', '月', '月下归鹤'],
    ['舟', '水', '一叶舟，随水行'],
    ['雾', '山', '雾锁山头'],
    ['月', '山', '山高月小'],
    ['雷', '墨', '雷动，墨惊'],
    ['灯', '夜', '一灯如豆'],
    ['亭', '山', '亭在山中'],
    ['松', '雪', '松雪傲寒'],
    ['兰', '月', '空谷幽兰'],
  ];

  A.World = class World {
    constructor(fluid) {
      this.fluid = fluid;
      this.w = 800; this.h = 600;
      this.entities = [];
      this.particles = [];
      this.fades = [];
      this.wind = { x: 0, y: 0 };
      this.windTarget = { x: 0.25, y: 0 };
      this.rainLevel = 0; this.snowLevel = 0; this.fogLevel = 0; this.thunderLevel = 0;
      this.clouds = 0;
      this.shake = 0;
      this.lastPhrase = '墨戏';
      this.glyphSize = 260;
      this.masks = new Map();
      this.maskTex = new Map();
      this.ruleCooldown = {};
      this.lastType = 0;
      this.wet = 0;
      this.time = 0;
    }

    resize(w, h) {
      this.w = w; this.h = h;
      this.glyphSize = A.clamp(Math.min(w, h) * 0.22, 104, 240);
      this.masks.clear();
      this.maskTex.clear();
    }

    get weather() {
      return { rain: this.rainLevel, snow: this.snowLevel, fog: this.fogLevel, thunder: this.thunderLevel };
    }

    // 字模（白字黑底），按字缓存
    getMask(ch, px) {
      const key = ch + '_' + px;
      if (!this.masks.has(key)) {
        const c = B.glyphMask(ch, px);
        this.masks.set(key, c);
      }
      return this.masks.get(key);
    }
    getMaskTex(ch, px) {
      const key = ch + '_' + px + '_gl';
      if (!this.maskTex.has(key)) {
        this.maskTex.set(key, this.fluid.loadMask(this.getMask(ch, px)));
      }
      return this.maskTex.get(key);
    }

    spawnAt(ch, x, y) {
      if (!ch) return null;
      x = A.clamp(x, 70, this.w - 70);
      y = A.clamp(y, 110, this.h - 180);
      if (ch === '洗') return this.wash();
      // 同一位置重复落同一字时，轻推开一点，避免叠成一团
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (Math.abs(e.x - x) < 90 && Math.abs(e.y - y) < 90) {
          x = A.clamp(x + 96, 70, this.w - 70);
          y = A.clamp(y - 54, 110, this.h - 180);
        }
      }
      this.lastPhrase = (this.lastPhrase + ch).slice(-6);
      const px = 512;
      const mask = this.getMask(ch, px);
      const size = this.glyphSize;
      const tex = this.getMaskTex(ch, px);

      // 落墨：字先成形
      const angle = A.rand(0.08, -0.08);
      this.fluid.stampMask(tex, x / this.w, 1 - y / this.h, size, angle, 0.88, A.rand(6.28));
      this.fades.push({ tex, x: x / this.w, y: 1 - y / this.h, size, angle, t: 0, tick: 0 });
      // 一圈极轻的笔压，让墨「活」一下
      for (let i = 0; i < 3; i++) {
        const a = A.rand(6.283), r = A.rand(size * 0.4, 10);
        this.fluid.splatVelPx(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 14);
      }
      this.spawnShards(mask, x, y, size);
      if (A.Audio) A.Audio.pluck(ch);
      if (A.Audio) A.Audio.brush(0.55, 1.6);

      const ent = A.makeEntity(ch, this, x, y);
      if (ent) {
        // 高个子物象（竹、松、亭…）按落点自动缩身，别顶出画外
        if (ent.H && ['竹','松','梅','柳','荷','菊','兰','亭','印'].includes(ch)) {
          const need = (y - 18) / ent.H;
          if (need < ent.k && need > 0.3) ent.k = need;
        }
        ent.reveal = 0;
        this.entities.push(ent);
        this.trim();
        this.checkRules(ch);
      }
      return ent;
    }

    spawnWeather(ch, x, y) {
      return this.spawnAt(ch, x, y);
    }

    wash() {
      this.entities.length = 0;
      this.particles.length = 0;
      this.fluid.clearDye(0);
      this.fluid.clearVelocity();
      A.toast('洗尽旧墨，重铺新纸');
      if (A.Audio) A.Audio.wash();
      return null;
    }

    trim() {
      if (this.entities.length > 42) {
        const idx = this.entities.findIndex(e => e.kind !== 'weather');
        this.entities.splice(idx >= 0 ? idx : 0, 1);
      }
    }

    spawnShards(mask, x, y, size) {
      const pts = B.glyphPoints(mask, 60);
      for (const p of pts) {
        const px = x + (p[0] - 0.5) * size, py = y + (p[1] - 0.5) * size;
        const ang = Math.atan2(py - y, px - x) + A.rand(0.8, -0.8);
        const sp = A.rand(90, 20);
        this.particles.push({
          x: px, y: py, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          r: A.rand(2.8, 0.9), t: 0, life: A.rand(1.2, 0.6), seed: A.rand(100),
        });
      }
      if (this.particles.length > 300) this.particles.splice(0, this.particles.length - 300);
    }

    blast(power) {
      const f = this.fluid;
      for (let i = 0; i < 14; i++) {
        const a = A.rand(6.283);
        f.splatVel(0.5 + Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.2, Math.cos(a) * 60 * power, Math.sin(a) * 60 * power, 0.08);
      }
    }

    checkRules(ch) {
      for (const [a, b, text] of RULES) {
        if (ch !== a && ch !== b) continue;
        const other = ch === a ? b : a;
        const hasOther = this.entities.some(e => e.char === other);
        if (!hasOther) continue;
        const key = a + b;
        if (this.ruleCooldown[key] && this.time - this.ruleCooldown[key] < 30) continue;
        this.ruleCooldown[key] = this.time;
        A.toast(text);
        // 组合时的轻微联动
        if (key === '风雨' || key === '风竹') this.shake = Math.max(this.shake, 0.15);
      }
    }

    update(dt) {
      this.time += dt;
      // 字形先显影，随后淡去，把画面让给物象
      for (const f of this.fades) {
        f.t += dt;
        if (f.t > 0.75 && f.t < 2.5) {
          f.tick += dt;
          if (f.tick > 0.12) {
            f.tick = 0;
            this.fluid.stampMask(f.tex, f.x, f.y, f.size, f.angle, -0.42, A.rand(6.28));
          }
        }
      }
      if (this.fades.length && this.fades[0].t > 3.5) this.fades.shift();
      // 天气统计
      let rain = 0, snow = 0, fog = 0, thunder = 0, clouds = 0, windCount = 0, windX = 0, windPow = 0;
      for (const e of this.entities) {
        if (e.char === '雨') rain++;
        if (e.char === '雪') snow++;
        if (e.char === '雾') fog++;
        if (e.char === '雷' && e.age < 6) thunder = Math.max(thunder, Math.max(0, 1 - e.age / 6));
        if (e.char === '云') clouds++;
        if (e.char === '风') { windCount++; windX += e.dir * e.strength; windPow += 1; }
        e.update(dt);
      }
      this.rainLevel = Math.min(1.2, rain * 0.55);
      this.snowLevel = Math.min(1.2, snow * 0.55);
      this.fogLevel = Math.min(1, fog * 0.5);
      this.thunderLevel = thunder;
      this.clouds = clouds;
      this.shake = Math.max(0, this.shake - dt * 3);
      this.wet = Math.max(0, this.wet - dt * 0.15);

      // 风
      let tx = 0.22 + Math.sin(this.time * 0.12) * 0.18, ty = 0;
      if (windCount) { tx = windX * 1.1; ty = Math.sin(this.time * 0.3) * 0.25; }
      if (rain > 0 || snow > 0) { tx += 0.15; }
      this.wind.x += (tx - this.wind.x) * Math.min(1, dt * 0.6);
      this.wind.y += (ty - this.wind.y) * Math.min(1, dt * 0.6);

      // 风推墨：天气真的会影响墨的形状
      if (Math.abs(this.wind.x) > 0.4) {
        this.fluid.addForce(this.wind.x * 0.055 * (this.w / 800), this.wind.y * 0.02);
      }

      // 墨屑
      for (const p of this.particles) {
        p.t += dt;
        p.x += p.vx * dt + Math.sin(p.t * 3 + p.seed) * 6 * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985; p.vy *= 0.985;
        p.alpha = Math.max(0, 1 - p.t / p.life);
      }
      this.particles = this.particles.filter(p => p.alpha > 0.02);
    }

    render(ctx) {
      ctx.save();
      if (this.shake > 0.02) {
        ctx.translate(A.rand(1, -1) * this.shake * 8, A.rand(1, -1) * this.shake * 6);
      }
      const list = this.entities.slice().sort((a, b) => a.z - b.z);
      for (const e of list) {
        if (e.reveal <= 0.01) continue;
        e.draw(ctx);
      }
      // 墨屑
      for (const p of this.particles) {
        ctx.globalAlpha = p.alpha * 0.8;
        B.dab(ctx, p.x, p.y, p.r, p.t * 3, p.alpha * 0.75);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    drawCursor(ctx, pos, active) {
      if (!pos) return;
      ctx.save();
      ctx.globalAlpha = active ? 0.55 : 0.28;
      ctx.strokeStyle = 'rgba(20,28,30,0.9)';
      ctx.lineWidth = 1;
      const r = this.glyphSize * 0.18;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 6.283);
      ctx.stroke();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 0.35, 0, 6.283);
      ctx.stroke();
      ctx.restore();
    }
  };

  // 让 A.ENTITIES 里的组合规则可被外部读取
  A.RULES = RULES;
})(window.INK);
