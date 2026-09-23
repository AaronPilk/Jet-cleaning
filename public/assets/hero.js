/* ============================================================
   The stage.

   One shader over the hero photograph. Everything is filmed over -
   streaked, flat, lifted - until a soft region under the pointer
   clears it, and inside that region the paint reads the way it
   actually looks after we have been at it: deeper, sharper, wet.
   A champagne rim sits on the boundary.

   It is the business, drawn rather than described.

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

    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float vnoise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),",
    "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);",
    "}",

    "void main(){",
    "  vec2 frag = gl_FragCoord.xy / uRes;",
    "  vec2 uv = cover(frag);",

    "  float ar = uRes.x / uRes.y;",
    "  vec2 d2 = (frag - uMouse) * vec2(ar, 1.0);",
    "  float ang = atan(d2.y, d2.x);",
    "  float d = length(d2);",

    // The edge breathes a little. A perfect circle reads as a spotlight;
    // this reads as a cloth.
    "  float wob = 0.030 * sin(ang * 3.0 + uTime * 0.7) + 0.018 * sin(ang * 5.0 - uTime * 0.5);",
    "  float r = uR * (0.85 + 0.15 * uIn);",
    "  float clean = 1.0 - smoothstep(r * 0.74, r + wob, d);",
    "  clean *= uIn;",

    // The film. Streaks along the direction a cloth would have gone, a soft
    // five-tap blur so detail is genuinely lost, then flattened and lifted.
    "  float streak = vnoise(uv * vec2(2.4, 34.0) + vec2(uTime * 0.006, 0.0));",
    "  float smear  = vnoise(uv * vec2(7.0, 3.0) - vec2(0.0, uTime * 0.004));",
    "  vec2  off    = vec2((streak - 0.5) * 0.0055, (smear - 0.5) * 0.0022);",
    "  vec3 f = texture2D(uTex, uv + off).rgb;",
    "  f += texture2D(uTex, uv + off + vec2( 0.0020, 0.0)).rgb;",
    "  f += texture2D(uTex, uv + off + vec2(-0.0020, 0.0)).rgb;",
    "  f += texture2D(uTex, uv + off + vec2(0.0,  0.0020)).rgb;",
    "  f += texture2D(uTex, uv + off + vec2(0.0, -0.0020)).rgb;",
    "  f /= 5.0;",
    "  float fl = dot(f, vec3(0.299, 0.587, 0.114));",
    "  vec3 filmed = mix(f, vec3(fl), 0.62);",
    // Condensation, not grime. The film is milk-white and sits in the highs,
    // so the whole frame reads as clean air until the cloth goes through it
    // and the sky comes back into the paint.
    "  filmed = mix(filmed, vec3(0.955, 0.960, 0.965), 0.56);",
    "  filmed = filmed * 0.52 + 0.46;",
    "  filmed += (streak - 0.5) * 0.045;",

    // The clean pass. Contrast and saturation back up, and the highlights
    // allowed to wet out the way fresh sealant does under ramp lights.
    "  vec3 c = texture2D(uTex, uv).rgb;",
    "  c = (c - 0.5) * 1.14 + 0.5;",
    "  float cl = dot(c, vec3(0.299, 0.587, 0.114));",
    // A light hand here. Push saturation much past this and the blue hour
    // sky inside the clean patch turns electric cyan, which reads as a
    // filter rather than as clean paint.
    "  c = mix(vec3(cl), c, 1.09);",
    "  c += vec3(0.035, 0.020, 0.0) * (1.0 - cl);",
    "  c += pow(max(cl - 0.74, 0.0), 1.6) * 0.45;",

    "  vec3 col = mix(filmed, c, clean);",

    // The boundary: a champagne rim and a whisper of prism, only where the
    // two states actually meet.
    // Cubed, so only the thin middle of the transition band gets it. Left
    // linear the fringe spreads across the whole falloff and the jet ends up
    // wearing a cyan halo.
    "  float edge = pow(clean * (1.0 - clean) * 4.0, 3.0);",
    "  if (edge > 0.01) {",
    "    vec2 n = normalize(d2 + 1e-5) * 0.0007 * edge;",
    "    col.r = mix(col.r, texture2D(uTex, uv + n).r, edge * 0.18);",
    "    col.b = mix(col.b, texture2D(uTex, uv - n).b, edge * 0.18);",
    "    col += vec3(0.69, 0.55, 0.34) * edge * 0.16;",
    "  }",

    "  gl_FragColor = vec4(col, 1.0);",
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
    gl.uniform1f(u.radius, 0.30);

    // On a tall, narrow window cover-fit throws most of the frame away. Aim
    // what is left at the nose rather than the middle of the file, so a phone
    // gets an aircraft instead of a slice of fuselage.
    // The nose sits dead centre of the photograph. Zoomed a little and aimed
    // left of centre, the frame shows the left of the file - wing and sky
    // under the copy - and the aircraft lands about two thirds across, clear
    // of the headline. A phone keeps the whole nose and crops the sides.
    function focus() {
      var portrait = window.innerWidth < window.innerHeight;
      gl.uniform1f(u.zoom, 1.0);
      gl.uniform2f(u.focus, portrait ? 0.455 : 0.5, portrait ? 0.46 : 0.5);
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
