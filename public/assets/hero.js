/* ============================================================
   The stage.

   One shader over the hero photograph, and the photograph is never
   touched: no film, no blur, nothing taken away. What moves is light.
   A soft glance of daylight follows the pointer across the paint - a
   little lift, a little more depth in the colour where it lands, and a
   faint champagne warmth in the highlights, the way sun moves over a
   fuselage when you walk around it on the ramp.

   Everything in this file is decoration. It runs in its own script
   so that if WebGL is missing, the context is refused, or a driver
   throws, the photograph underneath is simply left alone and the
   rest of the page never knows. Nothing here is load-bearing.
   ============================================================ */
(function () {
  "use strict";

  var stage = document.querySelector(".hero__stage");
  if (!stage) return;
  var canvas = stage.querySelector(".hero__canvas");
  var img = stage.querySelector(".hero__img");
  if (!canvas || !img) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  var VERT = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform sampler2D uTex;",
    "uniform vec2 uRes;",
    "uniform vec2 uImg;",
    "uniform vec2 uMouse;",
    "uniform float uTime;",
    "uniform float uIn;",
    "uniform float uR;",

    "uniform vec2 uFocus;",
    "uniform float uZoom;",
    // Cover-fit, so the photograph crops like object-fit: cover rather than
    // stretching when the viewport is a different shape to the file. The
    // ratio multiplies: it narrows the slice of the image we sample. Divide
    // instead and the sample range runs off the edge of the texture, which
    // CLAMP_TO_EDGE then smears into vertical stripes.
    "vec2 cover(vec2 uv){",
    "  float ca = uRes.x / uRes.y;",
    "  float ia = uImg.x / uImg.y;",
    "  vec2 sc = (ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0)) / uZoom;",
    "  vec2 f = clamp(uFocus, sc * 0.5, 1.0 - sc * 0.5);",
    "  return (uv - 0.5) * sc + f;",
    "}",

    "void main(){",
    "  vec2 frag = gl_FragCoord.xy / uRes;",
    "  vec2 uv = cover(frag);",

    "  float ar = uRes.x / uRes.y;",
    "  vec2 d2 = (frag - uMouse) * vec2(ar, 1.0);",
    "  float d = length(d2);",

    // The light. Wide and soft, with no hard edge anywhere, so it reads as
    // daylight moving rather than a torch.
    "  float r = uR * (0.9 + 0.1 * uIn);",
    "  float glow = 1.0 - smoothstep(0.0, r, d);",
    "  glow = glow * glow * uIn;",

    // A slow band of brighter sky crossing the frame on its own, so the
    // picture is alive before anyone reaches for it.
    "  float sweep = sin((uv.x * 1.6 - uv.y * 0.9) * 3.1416 - uTime * 0.22);",
    "  sweep = smoothstep(0.55, 1.0, sweep) * 0.045;",

    "  vec3 c = texture2D(uTex, uv).rgb;",
    "  float lum = dot(c, vec3(0.299, 0.587, 0.114));",

    // Where the light lands: a little more exposure, a little more depth,
    // highlights allowed to glint, and the warmth of low sun in the highs.
    "  vec3 lit = c * (1.0 + 0.10 * glow);",
    "  lit = (lit - 0.5) * (1.0 + 0.10 * glow) + 0.5;",
    "  lit = mix(vec3(dot(lit, vec3(0.299, 0.587, 0.114))), lit, 1.0 + 0.08 * glow);",
    "  lit += pow(max(lum - 0.70, 0.0), 1.5) * 0.35 * glow;",
    "  lit += vec3(0.10, 0.06, 0.0) * glow * lum * lum;",

    "  vec3 col = lit + sweep * (0.6 + 0.4 * lum);",
    "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function start() {
    var gl;
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" })
        || canvas.getContext("experimental-webgl");
    } catch (e) { return; }
    if (!gl) return;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // One triangle big enough to cover the clip space. Cheaper than a quad
    // and there is no seam down the diagonal.
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    } catch (e) { return; }

    var u = {
      tex: gl.getUniformLocation(prog, "uTex"),
      res: gl.getUniformLocation(prog, "uRes"),
      img: gl.getUniformLocation(prog, "uImg"),
      mouse: gl.getUniformLocation(prog, "uMouse"),
      time: gl.getUniformLocation(prog, "uTime"),
      intro: gl.getUniformLocation(prog, "uIn"),
      radius: gl.getUniformLocation(prog, "uR"),
      focus: gl.getUniformLocation(prog, "uFocus"),
      zoom: gl.getUniformLocation(prog, "uZoom")
    };
    gl.uniform1i(u.tex, 0);
    gl.uniform2f(u.img, img.naturalWidth || 1600, img.naturalHeight || 686);
    gl.uniform1f(u.radius, 0.62);

    // On a tall, narrow window cover-fit throws most of the frame away. The
    // aircraft sits right of centre in the file, so the portrait crop is
    // aimed there and a phone gets the nose and cabin rather than empty sky.
    function focus() {
      var portrait = window.innerWidth < window.innerHeight;
      gl.uniform1f(u.zoom, 1.0);
      gl.uniform2f(u.focus, portrait ? 0.62 : 0.5, 0.5);
    }
    focus();

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    function resize() {
      var r = canvas.getBoundingClientRect();
      var nw = Math.max(1, Math.round(r.width * dpr));
      var nh = Math.max(1, Math.round(r.height * dpr));
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.res, w, h);
      focus();
    }
    resize();

    // Pointer, smoothed. gl_FragCoord counts up from the bottom, so the y
    // has to be flipped once here rather than everywhere in the shader.
    var target = { x: 0.5, y: 0.52 };
    var pos = { x: 0.5, y: 0.52 };
    var touched = false;

    stage.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = 1 - (e.clientY - r.top) / r.height;
      if (!touched) { touched = true; stage.classList.add("is-touched"); }
    }, { passive: true });

    var t0 = performance.now();
    var visible = true;
    var running = false;
    var raf = 0;

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) { running = false; return; }
      resize();
      var t = (now - t0) / 1000;

      // Before anyone moves, the clean patch wanders on its own so the
      // effect is seen rather than waited for. Same path on a touchscreen,
      // where there is no pointer to follow at all.
      // Side by side with the copy, the wander keeps to the right of the
      // frame so the type is never read through the picture. Stacked on a
      // phone the copy is below the band, and the whole band is fair game.
      if (!touched) {
        var stacked = window.innerWidth <= 860;
        target.x = (stacked ? 0.5 : 0.63) + (stacked ? 0.26 : 0.2) * Math.sin(t * 0.34) + 0.06 * Math.sin(t * 0.71);
        target.y = 0.5 + 0.13 * Math.cos(t * 0.27) + 0.04 * Math.cos(t * 0.63);
      }
      pos.x += (target.x - pos.x) * 0.085;
      pos.y += (target.y - pos.y) * 0.085;

      gl.uniform2f(u.mouse, pos.x, pos.y);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.intro, Math.min(1, t / 1.5));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      running = true;
      raf = requestAnimationFrame(frame);
    }

    function kick() {
      if (!running && !raf) raf = requestAnimationFrame(frame);
    }

    if (reduced) {
      // One frame, held. No loop, no pointer following, no wander.
      gl.uniform2f(u.mouse, 0.5, 0.52);
      gl.uniform1f(u.time, 0);
      gl.uniform1f(u.intro, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      stage.classList.add("is-shaded", "is-touched");
      window.addEventListener("resize", function () {
        resize();
        gl.uniform1f(u.intro, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }, { passive: true });
      return;
    }

    stage.classList.add("is-shaded");
    if (coarse) stage.classList.add("is-touched");
    kick();

    // Nothing burns a battery on a hero nobody is looking at.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) kick();
      }, { threshold: 0 }).observe(stage);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) kick(); });
    window.addEventListener("resize", function () { resize(); kick(); }, { passive: true });

    // A lost context is a driver decision, not an error. Give the photograph
    // back rather than leaving a dead black rectangle.
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      visible = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0; running = false;
      stage.classList.remove("is-shaded");
    });
  }

  function whenReady() {
    if (img.complete && img.naturalWidth) { try { start(); } catch (e) {} }
    else img.addEventListener("load", function () { try { start(); } catch (e) {} }, { once: true });
  }

  if (document.readyState === "complete") whenReady();
  else window.addEventListener("load", whenReady, { once: true });
})();
