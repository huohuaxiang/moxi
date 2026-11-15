/* 墨戏 · 基础工具 */
window.INK = window.INK || {};
(function (A) {
  'use strict';
  A.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  A.lerp = (a, b, t) => a + (b - a) * t;
  A.rand = (a = 1, b = 0) => b + Math.random() * (a - b);
  A.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  A.choice = (arr) => arr[(Math.random() * arr.length) | 0];
  A.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  A.easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  A.easeOutBack = (t) => {
    const c1 = 1.201, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  A.isMobile = () => /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && innerWidth < 900) || innerWidth < 640;

  // 平滑值噪声
  function hash2(x, y) {
    let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  A.noise2 = function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return A.lerp(A.lerp(a, b, u), A.lerp(c, d, u), v);
  };
  A.noise1 = (x) => A.noise2(x, 0.37);

  // 简易弹簧（用于笔触回弹）
  A.spring = function (value) {
    return { v: value, target: value, k: 0.12, damp: 0.82,
      step() { this.v += (this.target - this.v) * this.k; this.damp = this.damp; return this.v; } };
  };

  A.now = () => performance.now() / 1000;

  // 轻提示
  A.toast = function (text) {
    const el = document.getElementById('whisper');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(A._toastTimer);
    A._toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  };
})(window.INK);
