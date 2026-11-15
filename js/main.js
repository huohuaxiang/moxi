/* 墨戏 · 主程序 */
(function (A) {
  'use strict';

  const app = A.app = {};
  const isMobile = A.isMobile();
  const qs = new URLSearchParams(location.search);

  let stage, glCanvas, fxCanvas, fctx;
  let fluid, world, brushTex, bootEl, hintEl, whisperEl, composer, spawnPos;
  let dpr = 1, W = 1, H = 1;
  let lastT = 0, frames = 0, fpsClock = 0, fps = 0;
  let pointer = { x: 0, y: 0, px: 0, py: 0, down: false, moved: false, t: 0 };
  let lastBrushSound = 0;
  let introDone = false;

  app.state = { fps: 0 };

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [glCanvas, fxCanvas]) {
      c.width = Math.max(2, Math.round(W * dpr));
      c.height = Math.max(2, Math.round(H * dpr));
    }
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.imageSmoothingEnabled = true;
    fluid.resize();
    world.resize(W, H);
    if (!pointer.moved) spawnPos = { x: W * 0.5, y: H * 0.52 };
  }

  function stamp(x, y, angle, size, strength, dx, dy, stretch) {
    fluid.stampMask(brushTex, x / W, 1 - y / H, size, angle, strength, Math.random() * 6.28, stretch || 1);
    fluid.splatVelPx(x, y, dx, dy, Math.max(14, size * 0.72));
  }

  function dab(x, y, power) {
    const size = isMobile ? 34 : 42;
    for (let i = 0; i < 4; i++) {
      const a = A.rand(6.283), r = A.rand(size * 0.5, 4);
      stamp(x + Math.cos(a) * r, y + Math.sin(a) * r, a + 1.57, size * A.rand(1.1, 0.8), 0.52 * power, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 1.15);
    }
    fluid.splatDye(x / W, 1 - y / H, 0.6 * power, 0.004);
    A.Audio.brush(0.5 * power, 0.22);
  }

  function drawSegment() {
    const dx = pointer.x - pointer.px;
    const dy = pointer.y - pointer.py;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.6) return;
    const dt = Math.max(0.006, Math.min(0.05, (performance.now() - pointer.t) / 1000));
    const speed = dist / dt;
    const size = A.clamp((isMobile ? 54 : 66) - speed * 0.028, 18, isMobile ? 54 : 70);
    const stretch = A.clamp(1.25 + speed / 900, 1.25, 1.9);
    const steps = Math.min(22, Math.max(1, Math.round(dist / (size * 0.32))));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = A.lerp(pointer.px, pointer.x, t);
      const y = A.lerp(pointer.py, pointer.y, t);
      stamp(x, y, Math.atan2(dy, dx), size * (0.84 + 0.24 * Math.random()), 0.55, dx / steps * 2.0, dy / steps * 2.0, stretch);
    }
    // 笔尖周围再补一点墨，避免断笔
    fluid.splatDye(pointer.x / W, 1 - pointer.y / H, 0.10, 0.0016 + size * 0.00003);
    if (performance.now() - lastBrushSound > 90) {
      lastBrushSound = performance.now();
      A.Audio.brush(A.clamp(speed / 600, 0.15, 1), 0.16);
    }
    pointer.px = pointer.x; pointer.py = pointer.y; pointer.t = performance.now();
  }

  let inputCount = 1, autoSlot = 0;

  function spawnChar(ch, i) {
    if (!ch || !world) return;
    hideHint();
    const slots = [[0.5, 0.5], [0.3, 0.42], [0.7, 0.4], [0.42, 0.64], [0.76, 0.62], [0.22, 0.64]];
    let base;
    if (!pointer.moved) {
      // 没有指针（手机点字牌）时，按预设位置轮转，避免全叠在中心
      const sp = slots[autoSlot++ % slots.length];
      base = { x: W * sp[0], y: H * sp[1] };
    } else {
      base = spawnPos || { x: W * 0.5, y: H * 0.52 };
    }
    const n = i || 0;
    // 一次输入多字时，沿横方向错开，别全叠在一处
    const spread = n && inputCount > 1 ? (n - (inputCount - 1) / 2) * Math.min(W * 0.11, 140) : 0;
    const x = A.clamp(base.x + spread, 80, W - 80);
    const y = A.clamp(base.y, 110, H - 180);
    world.spawnAt(ch, x, y);
    if (ch === '雷') A.Audio.thunder();
  }
  app.spawnChar = spawnChar;

  function hideHint() {
    if (hintEl) hintEl.classList.add('gone');
  }

  // ---------- 输入 ----------
  let composing = false;
  function consumeInput() {
    if (composing || !composer) return;
    const v = composer.value;
    if (!v) return;
    const chars = [...v].filter(c => /\S/.test(c));
    if (!chars.length) { composer.value = ''; return; }
    inputCount = chars.length;
    chars.forEach((c, i) => spawnChar(c, i));
    inputCount = 1;
    composer.value = '';
  }

  function bindUI() {
    composer.addEventListener('compositionstart', () => { composing = true; });
    composer.addEventListener('compositionend', () => { composing = false; setTimeout(consumeInput, 0); });
    composer.addEventListener('input', () => { if (!composing) setTimeout(consumeInput, 0); });
    composer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); consumeInput(); if (isMobile) composer.blur(); }
      if (e.key === 'Escape') { composer.value = ''; composer.blur(); }
    });

    document.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        A.Audio.init();
        const ch = btn.dataset.char;
        btn.classList.remove('pulse');
        void btn.offsetWidth;
        btn.classList.add('pulse');
        spawnChar(ch);
      });
    });

    document.getElementById('washBtn').addEventListener('click', (e) => {
      e.preventDefault();
      A.Audio.init();
      world.wash();
    });

    const soundBtn = document.getElementById('soundBtn');
    soundBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const muted = A.Audio.toggle();
      soundBtn.classList.toggle('off', muted);
      soundBtn.querySelector('span').textContent = muted ? '静' : '聲';
    });

    document.getElementById('enterBtn').addEventListener('click', (e) => {
      e.preventDefault();
      if (composer.value) { consumeInput(); }
      composer.focus();
    });

    // 桌面端：直接敲字也能落墨
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement === composer) return;
      if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') composer.focus();
    });
  }

  function bindPointer() {
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('footer') || e.target.closest('#tools') || e.target.closest('#brand')) return;
      A.Audio.init();
      pointer.down = true;
      pointer.x = e.clientX; pointer.y = e.clientY;
      pointer.px = e.clientX; pointer.py = e.clientY;
      pointer.t = performance.now();
      pointer.moved = true;
      spawnPos = { x: e.clientX, y: e.clientY };
      dab(e.clientX, e.clientY, 1.0);
      hideHint();
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('pointermove', (e) => {
      if (e.target && e.target.closest && e.target.closest('#ui, #tools, #brand, #hint, #whisper')) return;
      pointer.x = e.clientX; pointer.y = e.clientY;
      if (!pointer.moved) { pointer.px = pointer.x; pointer.py = pointer.y; pointer.t = performance.now(); }
      pointer.moved = true;
      spawnPos = { x: e.clientX, y: e.clientY };
      if (pointer.down) drawSegment();
    }, { passive: true });

    const end = () => {
      if (!pointer.down) return;
      pointer.down = false;
      // 收笔：一点余墨
      fluid.splatDye(pointer.x / W, 1 - pointer.y / H, 0.18, 0.002);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);

    stage.addEventListener('touchmove', (e) => { if (pointer.down) e.preventDefault(); }, { passive: false });
  }

  // ---------- 主循环 ----------
  function frame(t) {
    const dt = Math.min(0.033, Math.max(0.001, (t - lastT) / 1000 || 0.016));
    lastT = t;
    frames++;
    if (t - fpsClock > 700) { fps = Math.round(frames * 1000 / (t - fpsClock)); frames = 0; fpsClock = t; app.state.fps = fps; }

    world.update(dt);

    // 纸上的天气：雨雪湿气会影响墨的边界
    fluid.dyeDissipation = 0.018 + world.rainLevel * 0.03 + world.wet * 0.06;
    fluid.dyeDiffusion = 0.04 + world.rainLevel * 0.04;
    fluid.step(dt);

    let tint = [1, 1, 1];
    if (world.rainLevel > 0.1) tint = [0.985, 0.995, 1.02];
    if (world.snowLevel > 0.1) tint = [0.975, 0.99, 1.035];
    const hasMoon = world.entities.some(e => e.char === '月');
    if (hasMoon && world.rainLevel < 0.1) tint = [0.995, 1.0, 1.035];
    fluid.render({ fog: world.fogLevel * 0.34, tint, density: 1 });

    fctx.clearRect(0, 0, W, H);
    fctx.save();
    fctx.translate(0, 0);
    world.render(fctx);
    world.drawCursor(fctx, pointer, pointer.down);
    fctx.restore();

    A.Audio.update(world, dt);

    if (!introDone && t > 400) { introDone = true; window.__READY = true; }
    requestAnimationFrame(frame);
  }

  function intro() {
    if (qs.get('intro') === '0') return;
    setTimeout(() => {
      if (world.entities.length) return;
      const w = W, h = H;
      if (isMobile) {
        world.spawnAt('山', w * 0.46, h * 0.60);
        setTimeout(() => {
          if (world.entities.length > 2) return;
          world.spawnAt('月', w * 0.78, h * 0.18);
          A.toast('点下面的字，或写下你想看的字');
        }, 700);
        return;
      }
      world.spawnAt('山', w * 0.30, h * 0.815);
      setTimeout(() => {
        if (world.entities.length > 2) return;
        world.spawnAt('月', w * 0.765, h * 0.245);
        setTimeout(() => {
          if (world.entities.length > 3) return;
          world.spawnAt('竹', w * 0.86, h * 0.88);
          A.toast('试着写下：雨、风、鱼');
        }, 900);
      }, 800);
    }, 1100);
  }

  function autoSequence() {
    const q = qs.get('q');
    if (!q) return;
    const chars = [...q];
    const spots = [
      [0.24, 0.80], [0.46, 0.62], [0.70, 0.30], [0.80, 0.80], [0.54, 0.82], [0.33, 0.40], [0.62, 0.50],
    ];
    chars.forEach((ch, i) => {
      setTimeout(() => {
        const p = spots[i % spots.length];
        world.spawnAt(ch, W * p[0], H * p[1]);
      }, 900 + i * 700);
    });
  }

  function boot() {
    stage = document.getElementById('stage');
    glCanvas = document.getElementById('gl');
    fxCanvas = document.getElementById('fx');
    fctx = fxCanvas.getContext('2d');
    bootEl = document.getElementById('boot');
    hintEl = document.getElementById('hint');
    whisperEl = document.getElementById('whisper');
    composer = document.getElementById('composer');
    spawnPos = { x: 0.5, y: 0.5 };

    A.Brush.init();

    try {
      fluid = new A.Fluid(glCanvas, { mobile: isMobile });
    } catch (err) {
      bootEl.innerHTML = '<b>这方纸需要 WebGL2</b><br><span style="font-size:12px;letter-spacing:.1em">请用较新的 Chrome / Edge / Safari 打开</span>';
      console.error(err);
      window.__ERR = err.message;
      return;
    }
    world = new A.World(fluid);
    brushTex = fluid.loadMask(A.Brush.glDab);
    app.fluid = fluid;
    app.world = world;

    resize();
    bindUI();
    bindPointer();

    // 默认落笔位置
    spawnPos = { x: W * 0.5, y: H * 0.52 };
    window.addEventListener('resize', () => {
      clearTimeout(app._rz);
      app._rz = setTimeout(resize, 220);
    });

    if (!isMobile) setTimeout(() => composer.focus({ preventScroll: true }), 900);

    lastT = performance.now(); fpsClock = lastT;
    requestAnimationFrame(frame);
    setTimeout(() => bootEl.classList.add('gone'), 500);
    intro();
    autoSequence();

    window.__INK = {
      spawn: (ch, x, y) => world.spawnAt(ch, x != null ? x : W / 2, y != null ? y : H / 2),
      wash: () => world.wash(),
      probe: () => fluid.probe(),
      world, fluid,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  if (qs.get('debug') === '1') {
    setInterval(() => {
      app.state.fps = fps;
      document.title = `墨戏 ${fps}fps · 墨 ${(fluid ? (fluid.probe().cover * 100).toFixed(1) : 0)}%`;
    }, 500);
  }
})(window.INK);
