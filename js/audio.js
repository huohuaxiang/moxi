/* 墨戏 · 声音
 * 古琴式的拨弦（Karplus-Strong）、笔锋擦纸的沙沙声、雨、风、雷。
 */
(function (A) {
  'use strict';

  const Audio = A.Audio = {
    ctx: null, master: null, muted: false, ready: false,
    plucks: new Map(), noiseBuf: null, rainGain: null, windGain: null,
  };

  const PENTA = [1, 1.1225, 1.2599, 1.4983, 1.6818]; // 宫商角徵羽
  const BASE = 196; // G3

  function makeNoise(ctx, seconds) {
    const n = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function makePluck(ctx, freq) {
    const sr = ctx.sampleRate;
    const dur = 2.0;
    const n = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const N = Math.max(2, Math.floor(sr / freq));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    // 拨弦起始：柔化一下
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < N; i++) ring[i] = (ring[i] + ring[(i + 1) % N]) * 0.5;
    }
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const s = ring[idx];
      const next = (s * 0.55 + ring[(idx + 1) % N] * 0.45) * 0.9965;
      ring[idx] = next;
      out[i] = s * Math.min(1, 1.4 - i / (sr * 0.02)) * Math.exp(-i / (sr * 0.9));
      idx = (idx + 1) % N;
    }
    return buf;
  }

  Audio.init = function () {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);
      this.noiseBuf = makeNoise(ctx, 3);

      // 雨声底噪
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = this.noiseBuf; rainSrc.loop = true;
      const rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 700;
      const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 5000;
      this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
      rainSrc.connect(rh); rh.connect(rl); rl.connect(this.rainGain); this.rainGain.connect(this.master);
      rainSrc.start();

      // 风声
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = this.noiseBuf; windSrc.loop = true;
      const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      windSrc.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master);
      windSrc.start();

      this.ready = true;
      if (this.muted) this.master.gain.value = 0;
    } catch (e) { /* 静默失败，不影响画面 */ }
  };

  Audio.pluck = function (ch) {
    if (!this.ready || this.muted) return;
    const code = ch.charCodeAt(0);
    const idx = code % 5;
    const oct = (code % 3 === 0) ? 2 : 1;
    const freq = BASE * PENTA[idx] * oct;
    const key = freq.toFixed(1);
    if (!this.plucks.has(key)) this.plucks.set(key, makePluck(this.ctx, freq));
    const src = this.ctx.createBufferSource();
    src.buffer = this.plucks.get(key);
    const g = this.ctx.createGain();
    g.gain.value = 0.13;
    src.connect(g); g.connect(this.master);
    src.start();
  };

  Audio.brush = function (strength, dur) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 900; bp.Q.value = 0.8;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const vol = Math.min(0.28, 0.05 + strength * 0.10);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.22));
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start();
    src.stop(t + (dur || 0.22) + 0.05);
  };

  Audio.thunder = function () {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(80, t); lp.frequency.linearRampToValueAtTime(450, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); src.stop(t + 2.5);
  };

  Audio.wash = function () {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); src.stop(t + 1.4);
  };

  Audio.update = function (world, dt) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rain = A.clamp(world.rainLevel, 0, 1);
    const snow = A.clamp(world.snowLevel, 0, 1);
    const wind = A.clamp(Math.abs(world.wind.x) * 0.4, 0, 1);
    this.rainGain.gain.setTargetAtTime(rain * 0.10 + snow * 0.025, t, 0.3);
    this.windGain.gain.setTargetAtTime((wind * 0.045), t, 0.4);
  };

  Audio.toggle = function () {
    this.init();
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.15);
    }
    return this.muted;
  };
})(window.INK);
