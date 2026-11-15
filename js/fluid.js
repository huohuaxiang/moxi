/* 墨戏 · WebGL2 流体墨核
 * 稳定流体（Stable Fluids）：平流 → 涡量增强 → 压力泊松 → 去散度，
 * 墨作为 dye 被速度场搬运；字模/笔触以纹理印章注入。
 */
(function (A) {
  'use strict';

  const BASE_VS = `#version 300 es
  precision highp float;
  in vec2 aPos;
  uniform vec2 uTexelSize;
  out vec2 vUv;
  out vec2 vL;
  out vec2 vR;
  out vec2 vT;
  out vec2 vB;
  void main () {
    vUv = aPos * 0.5 + 0.5;
    vL = vUv - vec2(uTexelSize.x, 0.0);
    vR = vUv + vec2(uTexelSize.x, 0.0);
    vT = vUv + vec2(0.0, uTexelSize.y);
    vB = vUv - vec2(0.0, uTexelSize.y);
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

  const SPLAT_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTarget;
  uniform float uAspect;
  uniform vec3 uColor;
  uniform vec2 uPoint;
  uniform float uRadius;
  void main () {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    float g = exp(-dot(p, p) / max(uRadius, 1e-6));
    vec3 base = texture(uTarget, vUv).rgb;
    fragColor = vec4(base + g * uColor, 1.0);
  }`;

  const STAMP_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTarget;
  uniform sampler2D uMask;
  uniform vec2 uPoint;
  uniform vec2 uSize;
  uniform float uAngle;
  uniform float uStrength;
  uniform vec3 uColor;
  uniform float uAspect;
  uniform float uRough;
  void main () {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    float c = cos(uAngle), s = sin(uAngle);
    vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    vec2 uv = q / max(uSize, vec2(1e-6)) + 0.5;
    float m = 0.0;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      m = texture(uMask, uv).r;
    }
    // 边缘轻微抖动，模拟宣纸渗化
    vec2 uvr = uv * 6.2831 + uRough;
    m *= 0.94 + 0.12 * sin(uvr.x * 2.0) * sin(uvr.y * 3.0);
    vec3 base = texture(uTarget, vUv).rgb;
    fragColor = vec4(max(base + uColor * m * uStrength, vec3(0.0)), 1.0);
  }`;

  const ADVECTION_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexelSize;
  uniform vec2 uSourceTexel;
  uniform float uDt;
  uniform float uDissipation;
  uniform float uDiffusion;
  void main () {
    vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize;
    vec4 c = texture(uSource, coord);
    vec4 n = texture(uSource, coord + vec2(0.0, -1.0) * uSourceTexel);
    vec4 s = texture(uSource, coord + vec2(0.0,  1.0) * uSourceTexel);
    vec4 e = texture(uSource, coord + vec2( 1.0, 0.0) * uSourceTexel);
    vec4 w = texture(uSource, coord + vec2(-1.0, 0.0) * uSourceTexel);
    vec4 avg = (c * 4.0 + n + s + e + w) / 8.0;
    fragColor = mix(c, avg, uDiffusion) / (1.0 + uDissipation * uDt);
  }`;

  const CURL_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  in vec2 vL;
  in vec2 vR;
  in vec2 vT;
  in vec2 vB;
  out vec4 fragColor;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture(uVelocity, vL).y;
    float R = texture(uVelocity, vR).y;
    float T = texture(uVelocity, vT).x;
    float B = texture(uVelocity, vB).x;
    fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
  }`;

  const VORTICITY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  in vec2 vL;
  in vec2 vR;
  in vec2 vT;
  in vec2 vB;
  out vec4 fragColor;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float uCurlStrength;
  uniform float uDt;
  void main () {
    float L = texture(uCurl, vL).x;
    float R = texture(uCurl, vR).x;
    float T = texture(uCurl, vT).x;
    float B = texture(uCurl, vB).x;
    float C = texture(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-4;
    force *= uCurlStrength * C;
    force.y *= -1.0;
    vec2 vel = texture(uVelocity, vUv).xy;
    vel += force * uDt;
    vel = clamp(vel, -1200.0, 1200.0);
    fragColor = vec4(vel, 0.0, 1.0);
  }`;

  const DIVERGENCE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  in vec2 vL;
  in vec2 vR;
  in vec2 vT;
  in vec2 vB;
  out vec4 fragColor;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture(uVelocity, vL).x;
    float R = texture(uVelocity, vR).x;
    float T = texture(uVelocity, vT).y;
    float B = texture(uVelocity, vB).y;
    float div = 0.5 * (R - L + T - B);
    fragColor = vec4(div, 0.0, 0.0, 1.0);
  }`;

  const PRESSURE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  in vec2 vL;
  in vec2 vR;
  in vec2 vT;
  in vec2 vB;
  out vec4 fragColor;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  void main () {
    float L = texture(uPressure, vL).x;
    float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x;
    float B = texture(uPressure, vB).x;
    float div = texture(uDivergence, vUv).x;
    float p = (L + R + T + B - div) * 0.25;
    fragColor = vec4(p, 0.0, 0.0, 1.0);
  }`;

  const GRADIENT_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  in vec2 vL;
  in vec2 vR;
  in vec2 vT;
  in vec2 vB;
  out vec4 fragColor;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture(uPressure, vL).x;
    float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x;
    float B = texture(uPressure, vB).x;
    vec2 vel = texture(uVelocity, vUv).xy;
    vel -= 0.5 * vec2(R - L, T - B);
    fragColor = vec4(vel, 0.0, 1.0);
  }`;

  const CLEAR_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTexture;
  uniform float uValue;
  void main () {
    fragColor = uValue * texture(uTexture, vUv);
  }`;

  const FORCE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uVelocity;
  uniform vec2 uForce;
  uniform float uDt;
  void main () {
    vec2 v = texture(uVelocity, vUv).xy + uForce * uDt;
    fragColor = vec4(v, 0.0, 1.0);
  }`;

  const DISPLAY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uDye;
  uniform sampler2D uPaper;
  uniform sampler2D uNoise;
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uFog;
  uniform float uAspect;
  uniform vec3 uTint;
  uniform float uDensity;
  void main () {
    vec2 uv = vUv;
    float breathe = texture(uNoise, uv * vec2(uAspect, 1.0) * 1.6 + vec2(uTime * 0.010, uTime * 0.006)).r;
    uv += (breathe - 0.5) * 0.0024;

    float d = texture(uDye, uv).r * uDensity;
    float dx = texture(uDye, uv + vec2(uTexel.x, 0.0)).r - texture(uDye, uv - vec2(uTexel.x, 0.0)).r;
    float dy = texture(uDye, uv + vec2(0.0, uTexel.y)).r - texture(uDye, uv - vec2(0.0, uTexel.y)).r;
    float edge = length(vec2(dx, dy)) * uDensity;

    float a = 1.0 - exp(-d * 2.05);
    a = clamp(a + smoothstep(0.0, 0.85, edge) * 0.16, 0.0, 1.0);

    float g1 = texture(uNoise, uv * vec2(uAspect, 1.0) * 7.0 + 11.0).r;
    float g2 = texture(uNoise, uv * vec2(uAspect, 1.0) * 33.0 + 71.0).r;
    a *= (0.90 + 0.13 * g1) * (0.91 + 0.11 * g2);
    a = clamp(a, 0.0, 1.0);

    vec3 paper = texture(uPaper, uv * vec2(uAspect, 1.0) * 1.15).rgb;
    float core = smoothstep(0.12, 0.95, d);
    vec3 inkDeep = vec3(0.018, 0.027, 0.032);
    vec3 inkSoft = vec3(0.24, 0.255, 0.245);
    vec3 ink = mix(inkSoft, inkDeep, core);
    vec3 col = mix(paper, ink, a);

    col = mix(col, col * vec3(0.93, 0.97, 1.06), smoothstep(0.15, 0.9, edge) * 0.24);

    col *= uTint;
    col = mix(col, paper * 0.97 + 0.03, uFog);

    vec2 v = vUv - 0.5;
    float r = length(v * vec2(uAspect * 0.70, 1.0));
    col *= 1.0 - 0.14 * smoothstep(0.45, 1.12, r);

    float fg = texture(uNoise, uv * vec2(uAspect, 1.0) * 90.0).r;
    col += (fg - 0.5) * 0.008;

    fragColor = vec4(col, 1.0);
  }`;

  const COPY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTex;
  void main () { float d = texture(uTex, vUv).r; fragColor = vec4(d, d, d, 1.0); }`;

  const NAN_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTex;
  void main () {
    float v = texture(uTex, vUv).r;
    if (v != v) fragColor = vec4(1.0, 0.0, 0.0, 1.0);
    else fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(sh) + '\n' + src.slice(0, 500));
    }
    return sh;
  }

  function makeProgram(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, BASE_VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  function createFBO(gl, w, h, internal, format, type, filter) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete: 0x' + status.toString(16));
    return { tex, fbo, w, h, texelX: 1 / w, texelY: 1 / h, attach(id) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      return id;
    } };
  }

  function createDouble(gl, w, h, internal, format, type, filter) {
    let a = createFBO(gl, w, h, internal, format, type, filter);
    let b = createFBO(gl, w, h, internal, format, type, filter);
    return {
      get read() { return a; }, get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      w, h, texelX: 1 / w, texelY: 1 / h,
    };
  }

  A.Fluid = class {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.mobile = !!opts.mobile;
      const gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL2 不可用');
      this.gl = gl;
      const floatExt = gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear');
      if (!floatExt) throw new Error('EXT_color_buffer_float 不可用');

      this.simRes = opts.simRes || (this.mobile ? 96 : 160);
      this.dyeRes = opts.dyeRes || (this.mobile ? 380 : 900);
      this.iterations = opts.iterations || (this.mobile ? 12 : 20);
      this.curlStrength = opts.curlStrength != null ? opts.curlStrength : 26;
      this.pressureDamping = 0.82;
      this.velocityDissipation = 0.25;
      this.dyeDissipation = 0.055;
      this.dyeDiffusion = 0.10;

      this.programs = {
        splat: makeProgram(gl, SPLAT_FS),
        stamp: makeProgram(gl, STAMP_FS),
        advection: makeProgram(gl, ADVECTION_FS),
        curl: makeProgram(gl, CURL_FS),
        vorticity: makeProgram(gl, VORTICITY_FS),
        divergence: makeProgram(gl, DIVERGENCE_FS),
        pressure: makeProgram(gl, PRESSURE_FS),
        gradient: makeProgram(gl, GRADIENT_FS),
        clear: makeProgram(gl, CLEAR_FS),
        force: makeProgram(gl, FORCE_FS),
        display: makeProgram(gl, DISPLAY_FS),
        copy: makeProgram(gl, COPY_FS),
      };
      this.uniforms = {};
      for (const k in this.programs) {
        const p = this.programs[k];
        const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        const map = {};
        for (let i = 0; i < count; i++) {
          const info = gl.getActiveUniform(p, i);
          map[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
        }
        this.uniforms[k] = map;
      }

      // 全屏四边形
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      this.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      this.initFBOs();
      this.paperTex = this.createPaperTexture(1024);
      this.noiseTex = this.createNoiseTexture(256);
      this.dabTex = null;
      this.maskCache = new Map();
      this.time = 0;
      this.dpr = 1;
      this.resize();
    }

    initFBOs() {
      const gl = this.gl, s = this.simRes, d = this.dyeRes;
      const aspect = this.aspect || 1.4;
      const sw = s, sh = Math.max(24, Math.round(s / aspect));
      const dw = d, dh = Math.max(24, Math.round(d / aspect));
      const hf = gl.HALF_FLOAT;
      this.velocity = createDouble(gl, sw, sh, gl.RG16F, gl.RG, hf, gl.LINEAR);
      this.dye = createDouble(gl, dw, dh, gl.R16F, gl.RED, hf, gl.LINEAR);
      this.divergence = createFBO(gl, sw, sh, gl.R16F, gl.RED, hf, gl.NEAREST);
      this.curl = createFBO(gl, sw, sh, gl.R16F, gl.RED, hf, gl.NEAREST);
      this.pressure = createDouble(gl, sw, sh, gl.R16F, gl.RED, hf, gl.NEAREST);
    }

    createPaperTexture(size) {
      const gl = this.gl;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.fillStyle = '#f6f3ea';
      x.fillRect(0, 0, size, size);

      const wrap = (fn) => {
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) fn(i * size, j * size);
      };

      // 大块云絮状深浅
      for (let i = 0; i < 110; i++) {
        const rx = A.rand(size), ry = A.rand(size), r = A.rand(size * 0.20, size * 0.03);
        const tone = A.rand(10, -12);
        wrap((ox, oy) => {
          const rg = x.createRadialGradient(rx + ox, ry + oy, 0, rx + ox, ry + oy, r);
          rg.addColorStop(0, `rgba(${242 + tone},${238 + tone},${226 + tone},0.030)`);
          rg.addColorStop(1, 'rgba(246,242,232,0)');
          x.fillStyle = rg;
          x.beginPath(); x.arc(rx + ox, ry + oy, r, 0, 6.283); x.fill();
        });
      }

      // 纸纤维
      x.lineCap = 'round';
      for (let i = 0; i < 2400; i++) {
        const sx = A.rand(size), sy = A.rand(size);
        const ang = A.rand(6.283), len = A.rand(52, 4);
        const wob = A.rand(8, -8);
        const alpha = A.rand(0.075, 0.018);
        const col = `${A.randInt(120, 168)},${A.randInt(116, 162)},${A.randInt(104, 148)}`;
        wrap((ox, oy) => {
          x.strokeStyle = `rgba(${col},${alpha})`;
          x.lineWidth = A.rand(1.5, 0.35);
          x.beginPath();
          x.moveTo(sx + ox, sy + oy);
          x.quadraticCurveTo(
            sx + ox + Math.cos(ang) * len * 0.5 + wob, sy + oy + Math.sin(ang) * len * 0.5 + wob,
            sx + ox + Math.cos(ang) * len, sy + oy + Math.sin(ang) * len
          );
          x.stroke();
        });
      }

      // 细密纸病
      for (let i = 0; i < 1400; i++) {
        const sx = A.rand(size), sy = A.rand(size), r = A.rand(1.7, 0.25);
        wrap((ox, oy) => {
          x.fillStyle = `rgba(110,102,86,${A.rand(0.055, 0.012)})`;
          x.beginPath(); x.arc(sx + ox, sy + oy, r, 0, 6.283); x.fill();
        });
      }

      // 轻微横向帘纹，宣纸特有的抄纸纹
      for (let i = 0; i < 70; i++) {
        const sy = A.rand(size);
        x.strokeStyle = `rgba(150,145,130,${A.rand(0.035, 0.012)})`;
        x.lineWidth = A.rand(2.2, 0.6);
        x.beginPath(); x.moveTo(0, sy); x.lineTo(size, sy + A.rand(4, -4)); x.stroke();
      }

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      return tex;
    }

    createNoiseTexture(size) {
      const gl = this.gl;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      const img = x.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const v = Math.floor(A.rand(255));
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      // 轻微平滑，避免噪点过硬
      x.globalAlpha = 0.55;
      x.filter = 'blur(1px)';
      x.drawImage(c, 0, 0);
      x.filter = 'none';
      x.globalAlpha = 1;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      return tex;
    }

    loadMask(canvas) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }

    resize() {
      const gl = this.gl;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr));
      const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      const aspect = w / h;
      const changed = Math.abs(aspect - (this.aspect || 0)) > 0.02;
      this.aspect = aspect;
      if (changed && this.dye) this.initFBOs();
      gl.viewport(0, 0, w, h);
    }

    blit(target, clear) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      if (target) gl.viewport(0, 0, target.w, target.h);
      else gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // program 使用
    begin(key, texelX, texelY) {
      const gl = this.gl;
      const p = this.programs[key];
      const u = this.uniforms[key];
      gl.useProgram(p);
      if (u.uTexelSize) gl.uniform2f(u.uTexelSize, texelX, texelY);
      gl.bindVertexArray(this.vao);
      return u;
    }

    splatVelPx(x, y, dx, dy, radiusPx) {
      this.splatVel(x / this.canvas.clientWidth, 1 - y / this.canvas.clientHeight, dx, dy, radiusPx / this.canvas.clientHeight);
    }

    splatVel(x, y, dx, dy, radiusN) {
      const gl = this.gl;
      const u = this.begin('splat', this.velocity.texelX, this.velocity.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uTarget, 0);
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform2f(u.uPoint, x, y);
      gl.uniform1f(u.uRadius, Math.max(radiusN * radiusN, 1e-7));
      gl.uniform3f(u.uColor, dx, dy, 0);
      this.blit(this.velocity.write);
      this.velocity.swap();
    }

    splatDye(x, y, amount, radiusN) {
      const gl = this.gl;
      const u2 = this.begin('splat', this.dye.texelX, this.dye.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
      gl.uniform1i(u2.uTarget, 0);
      gl.uniform1f(u2.uAspect, this.aspect);
      gl.uniform2f(u2.uPoint, x, y);
      gl.uniform1f(u2.uRadius, Math.max(radiusN * radiusN, 1e-7));
      gl.uniform3f(u2.uColor, amount, 0, 0);
      this.blit(this.dye.write);
      this.dye.swap();
    }

    stampMask(tex, x, y, sizePx, angle, amount, rough, stretch) {
      const gl = this.gl;
      const u = this.begin('stamp', this.dye.texelX, this.dye.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
      gl.uniform1i(u.uTarget, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uMask, 1);
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform2f(u.uPoint, x, y);
      gl.uniform2f(u.uSize, sizePx * (stretch || 1) / this.canvas.clientHeight, sizePx / this.canvas.clientHeight);
      gl.uniform1f(u.uAngle, angle || 0);
      gl.uniform1f(u.uStrength, amount);
      gl.uniform3f(u.uColor, 1, 0, 0);
      gl.uniform1f(u.uRough, rough || A.rand(6.283));
      this.blit(this.dye.write);
      this.dye.swap();
    }

    addForce(fx, fy) {
      const gl = this.gl;
      const u = this.begin('force', this.velocity.texelX, this.velocity.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uVelocity, 0);
      gl.uniform2f(u.uForce, fx, fy);
      gl.uniform1f(u.uDt, 1.0);
      this.blit(this.velocity.write);
      this.velocity.swap();
    }

    step(dt) {
      const gl = this.gl;
      this.time += dt;
      dt = Math.min(dt, 0.033);

      // 涡量
      let u = this.begin('curl', this.velocity.texelX, this.velocity.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uVelocity, 0);
      this.blit(this.curl);

      u = this.begin('vorticity', this.velocity.texelX, this.velocity.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uVelocity, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.curl.tex);
      gl.uniform1i(u.uCurl, 1);
      gl.uniform1f(u.uCurlStrength, this.curlStrength);
      gl.uniform1f(u.uDt, dt);
      this.blit(this.velocity.write);
      this.velocity.swap();

      // 散度
      u = this.begin('divergence', this.velocity.texelX, this.velocity.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uVelocity, 0);
      this.blit(this.divergence);

      // 压强衰减 + Jacobi
      u = this.uniforms.clear;
      gl.useProgram(this.programs.clear);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
      gl.uniform1i(u.uTexture, 0);
      gl.uniform1f(u.uValue, this.pressureDamping);
      this.blit(this.pressure.write);
      this.pressure.swap();

      u = this.begin('pressure', this.pressure.texelX, this.pressure.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.divergence.tex);
      gl.uniform1i(u.uDivergence, 0);
      for (let i = 0; i < this.iterations; i++) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
        gl.uniform1i(u.uPressure, 1);
        this.blit(this.pressure.write);
        this.pressure.swap();
      }

      // 去散度
      u = this.begin('gradient', this.velocity.texelX, this.velocity.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
      gl.uniform1i(u.uPressure, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uVelocity, 1);
      this.blit(this.velocity.write);
      this.velocity.swap();

      // 平流速度
      u = this.begin('advection', this.velocity.texelX, this.velocity.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uVelocity, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uSource, 1);
      gl.uniform2f(u.uSourceTexel, this.velocity.texelX, this.velocity.texelY);
      gl.uniform1f(u.uDt, dt);
      gl.uniform1f(u.uDissipation, this.velocityDissipation);
      gl.uniform1f(u.uDiffusion, 0.0);
      this.blit(this.velocity.write);
      this.velocity.swap();

      // 平流墨
      u = this.begin('advection', this.dye.texelX, this.dye.texelY);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uVelocity, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
      gl.uniform1i(u.uSource, 1);
      gl.uniform2f(u.uSourceTexel, this.dye.texelX, this.dye.texelY);
      gl.uniform1f(u.uDt, dt);
      gl.uniform1f(u.uDissipation, this.dyeDissipation);
      gl.uniform1f(u.uDiffusion, this.dyeDiffusion);
      this.blit(this.dye.write);
      this.dye.swap();

      gl.bindVertexArray(null);
    }

    render(opts = {}) {
      const gl = this.gl, u = this.uniforms.display;
      gl.useProgram(this.programs.display);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
      gl.uniform1i(u.uDye, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.paperTex);
      gl.uniform1i(u.uPaper, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
      gl.uniform1i(u.uNoise, 2);
      gl.uniform2f(u.uTexel, this.dye.texelX, this.dye.texelY);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform1f(u.uFog, opts.fog || 0);
      gl.uniform1f(u.uAspect, this.aspect);
      const tint = opts.tint || [1, 1, 1];
      gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
      gl.uniform1f(u.uDensity, opts.density || 1);
      this.blit(null);
      gl.bindVertexArray(null);
    }

    clearDye(fade = 0) {
      const gl = this.gl;
      const u = this.uniforms.clear;
      gl.useProgram(this.programs.clear);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
      gl.uniform1i(u.uTexture, 0);
      gl.uniform1f(u.uValue, fade);
      this.blit(this.dye.write);
      this.dye.swap();
      gl.bindVertexArray(null);
    }

    clearVelocity() {
      const gl = this.gl;
      const u = this.uniforms.clear;
      gl.useProgram(this.programs.clear);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
      gl.uniform1i(u.uTexture, 0);
      gl.uniform1f(u.uValue, 0);
      this.blit(this.velocity.write);
      this.velocity.swap();
      gl.bindVertexArray(null);
    }

    // 自检：把指定纹理缩到 48x32 读回，返回最大/平均浓度
    probeTex(tex) {
      const gl = this.gl;
      if (!this._probeFBO) this._probeFBO = createFBO(gl, 48, 32, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      const u = this.uniforms.copy;
      gl.useProgram(this.programs.copy);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uTex, 0);
      this.blit(this._probeFBO);
      const px = new Uint8Array(48 * 32 * 4);
      gl.readPixels(0, 0, 48, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let max = 0, min = 255, sum = 0, n = 0;
      for (let i = 0; i < 48 * 32; i++) {
        const v = px[i * 4];
        if (v > max) max = v;
        if (v < min) min = v;
        if (v > 2) { sum += v; n++; }
      }
      gl.bindVertexArray(null);
      return { max, min, avg: n ? sum / n : 0, cover: n / (48 * 32) };
    }

    probe() { return this.probeTex(this.dye.read.tex); }

    probeNaN(tex) {
      const gl = this.gl;
      if (!this._nanProg) this._nanProg = makeProgram(gl, NAN_FS);
      if (!this._probeFBO) this._probeFBO = createFBO(gl, 48, 32, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      gl.useProgram(this._nanProg);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(this._nanProg, 'uTex'), 0);
      this.blit(this._probeFBO);
      const px = new Uint8Array(48 * 32 * 4);
      gl.readPixels(0, 0, 48, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0;
      for (let i = 0; i < 48 * 32; i++) if (px[i * 4] > 128) n++;
      gl.bindVertexArray(null);
      return n;
    }
  };
})(window.INK);
