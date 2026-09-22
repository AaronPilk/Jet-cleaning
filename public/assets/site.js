(function () {
  "use strict";
  var P = window.PRICING;
  var DEMO = !!window.SITE_DEMO;
  if (!P) return;

  var fmt = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var byCode = {};
  P.services.forEach(function (s) { byCode[s.code] = s; });
  var $ = function (id) { return document.getElementById(id); };

  // ============================================================
  // Motion: springs. Every animation starts from the live
  // on-screen value, carries velocity, and can be redirected
  // mid-flight. Nothing here locks out input.
  // ============================================================
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  function Spring(value, opts) {
    opts = opts || {};
    this.v = value;            // presentation value
    this.target = value;
    this.vel = 0;
    this.damping = opts.damping == null ? 1 : opts.damping;   // 1 = no overshoot
    this.response = opts.response == null ? 0.36 : opts.response; // seconds
    this.onFrame = opts.onFrame || function () {};
    this.raf = 0;
    this.last = 0;
  }
  Spring.prototype.set = function (target, velocity) {
    this.target = target;
    if (velocity != null) this.vel = velocity;
    if (reduce && reduce.matches) {      // gentler equivalent, not "none"
      this.v = target; this.vel = 0; this.onFrame(this.v); return;
    }
    this.start();
  };
  Spring.prototype.snap = function (value) {
    this.stop(); this.v = this.target = value; this.vel = 0; this.onFrame(this.v);
  };
  Spring.prototype.stop = function () { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } };
  Spring.prototype.start = function () {
    if (this.raf) return;
    var self = this;
    this.last = performance.now();
    var tick = function (now) {
      var dt = Math.min((now - self.last) / 1000, 1 / 30);
      self.last = now;
      var w = 6.2831853 / self.response;        // natural frequency
      var z = self.damping;
      var x = self.v - self.target;
      // semi-implicit integration: stable, and correct from any live value
      var accel = -w * w * x - 2 * z * w * self.vel;
      self.vel += accel * dt;
      self.v += self.vel * dt;
      self.onFrame(self.v);
      if (Math.abs(self.v - self.target) < 0.05 && Math.abs(self.vel) < 0.35) {
        self.v = self.target; self.vel = 0; self.onFrame(self.v); self.raf = 0; return;
      }
      self.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };

  // ---------- segmented control: X and width are independent springs
  function segmentedThumb(root) {
    var thumb = root.querySelector(".classpick__thumb");
    if (!thumb) return function () {};
    var x = new Spring(0, { damping: 1, response: 0.34, onFrame: paint });
    var w = new Spring(0, { damping: 1, response: 0.34, onFrame: paint });
    function paint() {
      thumb.style.transform = "translate3d(" + x.v.toFixed(2) + "px,0,0)";
      thumb.style.width = Math.max(0, w.v).toFixed(2) + "px";
    }
    var first = true;
    return function move(btn) {
      if (!btn) return;
      var tx = btn.offsetLeft - root.clientLeft;
      var tw = btn.offsetWidth;
      if (first) { x.snap(tx); w.snap(tw); thumb.classList.add("is-ready"); first = false; return; }
      x.set(tx); w.set(tw);
    };
  }

  // ---------- a number that springs to its new value
  function springNumber(el, format) {
    var shown = null, suffix = "";
    var sp = new Spring(0, {
      damping: 1, response: 0.40,
      onFrame: function (v) {
        var r = Math.round(v);
        if (r !== shown) { shown = r; el.textContent = format(r) + suffix; }
      }
    });
    var first = true;
    return function (value, sfx) {
      suffix = sfx || "";
      shown = null;
      if (first) { first = false; sp.snap(value); return; }
      sp.set(value);
    };
  }

  function unitPrice(code, cls) {
    var s = byCode[code];
    if (!s) return null;
    var v = s.prices[cls];
    return v === undefined || v === null ? null : v;
  }

  var totalEl = $("est-total");
  var setTotal = totalEl ? springNumber(totalEl, fmt) : function () {};

  // ---------- class picker (services + programs)
  var picker = $("classpick");
  var pickCls = P.defaultClass;

  var moveThumb = picker ? segmentedThumb(picker) : function () {};

  function renderPicker() {
    if (!picker) return;
    var active = null;
    Array.prototype.forEach.call(picker.querySelectorAll("button[data-cls]"), function (b) {
      var on = b.getAttribute("data-cls") === pickCls;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      if (on) active = b;
    });
    moveThumb(active);
    var ex = $("class-examples");
    if (ex) ex.textContent = P.classes[pickCls].examples;
  }

  function renderMenu() {
    Array.prototype.forEach.call(document.querySelectorAll("#menu [data-price]"), function (el) {
      var v = unitPrice(el.getAttribute("data-price"), pickCls);
      el.textContent = v === null ? "Quoted" : fmt(v);
    });
    var pc = $("program-class");
    if (pc) pc.textContent = P.classes[pickCls].label;
    var pr = P.programs[pickCls];
    Array.prototype.forEach.call(document.querySelectorAll("#program-rows [data-program]"), function (el) {
      var v = pr ? pr[el.getAttribute("data-program")] : null;
      el.textContent = v ? fmt(v) : "Quoted";
    });
  }

  if (picker) {
    picker.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-cls]");
      if (!b) return;
      pickCls = b.getAttribute("data-cls");
      renderPicker();
      renderMenu();
    });
    picker.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var btns = Array.prototype.slice.call(picker.querySelectorAll("button[data-cls]"));
      var i = btns.findIndex(function (b) { return b.getAttribute("data-cls") === pickCls; });
      i = (i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length;
      pickCls = btns[i].getAttribute("data-cls");
      renderPicker();
      renderMenu();
      btns[i].focus();
      e.preventDefault();
    });
    renderPicker();
    renderMenu();
  }

  // ---------- estimator
  var form = $("quote-form");
  if (!form) return;
  var model = $("q-model"), airport = $("q-airport"), timing = $("q-timing"), after = $("q-after");

  function currentClass() {
    var opt = model.options[model.selectedIndex];
    return opt ? opt.getAttribute("data-cls") : "Q";
  }

  function qtyFor(code) {
    var el = document.querySelector('input[data-qty="' + code + '"]');
    if (!el) return 1;
    var n = parseInt(el.value || "1", 10);
    if (isNaN(n)) n = 1;
    return Math.max(1, Math.min(40, n));
  }

  function lineAmount(code, cls, qty) {
    var unit = unitPrice(code, cls);
    if (unit === null) return null;
    if (code === "STAIN") {
      var extra = unitPrice("STAIN2", cls);
      return unit + (qty - 1) * (extra === null ? unit : extra);
    }
    return unit * qty;
  }

  function estimate() {
    var cls = currentClass();
    var lines = [];
    var sub = 0;
    var manual = cls === "Q";

    Array.prototype.forEach.call(document.querySelectorAll('#q-services input[type="checkbox"][data-code]'), function (cb) {
      var code = cb.getAttribute("data-code");
      var s = byCode[code];
      var unit = unitPrice(code, cls);
      var unitEl = document.querySelector('[data-unit="' + code + '"]');
      if (unitEl) unitEl.textContent = unit === null ? "quote" : fmt(unit) + (s.unitLabel ? " " + s.unitLabel : "");
      if (!cb.checked) return;
      var qty = qtyFor(code);
      var amt = lineAmount(code, cls, qty);
      if (amt === null) {
        manual = true;
        lines.push([s.name, null]);
        return;
      }
      sub += amt;
      lines.push([s.name + (qty > 1 ? " × " + qty : ""), amt]);
    });

    var base = sub;
    if (sub > 0 && sub < P.fees.minInvoice) {
      lines.push(["Call-out minimum", P.fees.minInvoice - sub]);
      base = P.fees.minInvoice;
    }
    // Response fees are flat, not a percentage. Same-day is the product, not a surcharge.
    var rush = P.timing[timing.value] || 0;
    var ah = after.checked ? P.fees.afterHours : 0;
    if (base > 0 && rush) lines.push([timing.options[timing.selectedIndex].text.split(" \u2014 ")[0], rush]);
    if (base > 0 && ah) lines.push(["After-hours start", ah]);
    var total = base + (base > 0 ? rush + ah : 0);

    var ap = null;
    for (var i = 0; i < P.airports.length; i++) if (P.airports[i].code === airport.value) ap = P.airports[i];
    if (total > 0 && ap && ap.travel) {
      lines.push(["Travel to " + ap.code, ap.travel]);
      total += ap.travel;
    }

    var list = $("est-lines");
    list.innerHTML = "";
    if (!lines.length) {
      var li0 = document.createElement("li");
      li0.className = "muted";
      li0.innerHTML = "<span>Pick at least one service</span><span></span>";
      list.appendChild(li0);
    }
    lines.forEach(function (l) {
      var li = document.createElement("li");
      var a = document.createElement("span");
      var b = document.createElement("span");
      a.textContent = l[0];
      b.textContent = l[1] === null ? "quote" : fmt(l[1]);
      li.appendChild(a);
      li.appendChild(b);
      list.appendChild(li);
    });

    setTotal(total, manual && total > 0 ? " +" : "");
    var opt = model.options[model.selectedIndex];
    $("est-aircraft").textContent = (opt ? opt.value : "Aircraft") + " at " + (ap ? ap.code : "your airport");

    var notice = $("est-notice");
    var msgs = [];
    if (manual) msgs.push("Part of this job needs a custom quote. Send it and we'll price it by hand.");
    if (ap && ap.zone === "C") msgs.push("Travel outside Tampa Bay is quoted separately.");
    notice.hidden = msgs.length === 0;
    notice.textContent = msgs.join(" ");

    return { cls: cls, lines: lines, total: total, manual: manual, airport: ap };
  }

  form.addEventListener("change", estimate);
  form.addEventListener("input", function (e) {
    if (e.target && e.target.matches('input[data-qty]')) estimate();
  });
  estimate();

  // ---------- send
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = $("f-status");
    var btn = $("f-submit");
    var name = $("f-name").value.trim();
    var email = $("f-email").value.trim();
    var phone = $("f-phone").value.trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.replace(/\D/g, "").length < 10) {
      status.className = "formstatus err";
      status.textContent = "Add your name, a valid email and a 10-digit phone number, then send again.";
      return;
    }
    var est = estimate();
    var payload = {
      name: name,
      company: $("f-company").value.trim(),
      role: $("f-role").value,
      email: email,
      phone: phone,
      date_needed: $("f-date").value,
      notes: $("f-notes").value.trim(),
      sms_consent: $("f-sms").checked,
      aircraft: model.value,
      aircraft_class: est.cls,
      airport: airport.value,
      timing: timing.options[timing.selectedIndex].text,
      after_hours: after.checked,
      services: est.lines.map(function (l) { return l[0] + ": " + (l[1] === null ? "quote" : Math.round(l[1])); }).join("; "),
      estimate_total: Math.round(est.total),
      needs_manual_quote: est.manual,
      website: $("f-website").value,
      source: "Website instant estimate",
      page: String(window.location.href).slice(0, 300)
    };
    btn.disabled = true;
    status.className = "formstatus";
    status.textContent = "Sending...";

    if (DEMO) {
      setTimeout(function () {
        status.className = "formstatus ok";
        status.textContent = "Preview only: on the live site this request goes straight into your GoHighLevel pipeline.";
        btn.disabled = false;
      }, 400);
      return;
    }

    fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || "Send failed");
        status.className = "formstatus ok";
        status.textContent = "Sent. We'll confirm availability and your final price shortly.";
      })
      .catch(function () {
        status.className = "formstatus err";
        status.textContent = "That didn't go through. Email hello@nextlegdetail.com and we'll take it from there.";
      })
      .then(function () { btn.disabled = false; });
  });

  // ============================================================
  // Chrome: scroll-edge material, materialize-on-enter, press feedback
  // ============================================================
  var bar = document.querySelector(".topbar");
  if (bar && "IntersectionObserver" in window) {
    var sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none";
    document.body.insertBefore(sentinel, document.body.firstChild);
    new IntersectionObserver(function (entries) {
      bar.classList.toggle("is-stuck", !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(sentinel);
  }

  var reveals = document.querySelectorAll(".reveal");
  var showAll = function () {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("is-in"); });
  };
  if ("IntersectionObserver" in window && reveals.length) {
    // Hide first, watch second, in that order and nowhere earlier: the page
    // only goes dark once something is guaranteed to bring it back.
    document.documentElement.classList.add("js");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
    // Belt and braces. If an observer never fires - a stalled tab, a
    // printing context, a browser we have not met - show everything anyway.
    setTimeout(showAll, 4000);
    window.addEventListener("beforeprint", showAll);
  } else {
    showAll();
  }

  // ============================================================
  // Choreography
  //
  // All of this is decoration and all of it is additive: every element
  // it touches is already readable before a single line of it runs, and
  // the CSS only hides anything once .js is on the document - which the
  // block above sets, and only right before it can undo it.
  // ============================================================
  var slow = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var io2 = "IntersectionObserver" in window
    ? function (el, fn, opts) { var o = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { fn(e.target); o.unobserve(e.target); } });
      }, opts || { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }); o.observe(el); }
    : function (el, fn) { fn(el); };

  // ---- headline words rise out of their own line box
  // Only leaf text nodes are split, so the <em> in the hero headline keeps
  // its italic and the markup stays meaningful.
  Array.prototype.forEach.call(document.querySelectorAll("[data-split]"), function (head) {
    var n = 0;
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.nodeValue.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var wrap = document.createElement("span");
            wrap.className = "wordwrap";
            var word = document.createElement("span");
            word.className = "word";
            word.style.setProperty("--d", (n++ * 70) + "ms");
            word.textContent = part;
            wrap.appendChild(word);
            frag.appendChild(wrap);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(head);
    if (!n) return;
    // The hero headline is above the fold, so it plays at once rather than
    // waiting for a scroll that may never come.
    if (head.closest && head.closest(".hero")) {
      requestAnimationFrame(function () { head.classList.add("is-in"); });
    } else {
      io2(head, function (el) { el.classList.add("is-in"); });
    }
    setTimeout(function () { head.classList.add("is-in"); }, 4000);
  });

  // ---- price rows cascade
  Array.prototype.forEach.call(document.querySelectorAll(".menu"), function (list) {
    Array.prototype.forEach.call(list.children, function (li, i) {
      li.style.setProperty("--i", Math.min(i, 12));
    });
    io2(list, function (el) { el.classList.add("is-in"); });
    setTimeout(function () { list.classList.add("is-in"); }, 4000);
  });

  // ---- the hairline draws itself across a section edge
  Array.prototype.forEach.call(document.querySelectorAll(".section--alt"), function (sec) {
    io2(sec, function (el) { el.classList.add("is-in"); }, { rootMargin: "0px 0px -4% 0px", threshold: 0 });
  });

  // ---- the four job steps take it in turns
  var steps = document.querySelector(".steps");
  if (steps && !slow && "IntersectionObserver" in window) {
    var items = Array.prototype.slice.call(steps.children);
    if (items.length > 1) {
      var tracking = false;
      var mark = function () {
        var mid = window.innerHeight * 0.48;
        var best = null, bestD = Infinity;
        items.forEach(function (li) {
          var r = li.getBoundingClientRect();
          var d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bestD) { bestD = d; best = li; }
        });
        items.forEach(function (li) { li.classList.toggle("is-current", li === best); });
      };
      new IntersectionObserver(function (es) {
        tracking = es[0].isIntersecting;
        steps.classList.toggle("is-tracking", tracking);
        if (tracking) mark();
      }, { threshold: 0.08 }).observe(steps);
      var ticking = false;
      window.addEventListener("scroll", function () {
        if (!tracking || ticking) return;
        ticking = true;
        requestAnimationFrame(function () { mark(); ticking = false; });
      }, { passive: true });
    }
  }

  // ---- the standing call to action, once the hero's own has gone
  var corner = document.querySelector(".corner");
  var stageEl = document.querySelector(".hero__stage");
  if (corner && stageEl && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      corner.classList.toggle("is-on", !es[0].isIntersecting);
    }, { threshold: 0 }).observe(stageEl);
  } else if (corner) {
    corner.classList.add("is-on");
  }

  // ---- the cursor, which over the hero is the cloth
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var ring = document.querySelector(".cursor");
  if (ring && fine && !slow) {
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2, rx = cx, ry = cy, spinning = false;
    var step = function () {
      rx += (cx - rx) * 0.22;
      ry += (cy - ry) * 0.22;
      ring.style.transform = "translate3d(" + rx.toFixed(2) + "px," + ry.toFixed(2) + "px,0)";
      if (Math.abs(cx - rx) > 0.1 || Math.abs(cy - ry) > 0.1) requestAnimationFrame(step);
      else spinning = false;
    };
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      cx = e.clientX; cy = e.clientY;
      ring.classList.add("is-on");
      var t = e.target;
      var link = t && t.closest ? t.closest("a, button, summary, label, input, select, textarea") : null;
      ring.classList.toggle("is-link", !!link);
      ring.classList.toggle("is-stage", !link && !!(t && t.closest && t.closest(".hero__stage")));
      if (!spinning) { spinning = true; requestAnimationFrame(step); }
    }, { passive: true });
    document.addEventListener("pointerleave", function () { ring.classList.remove("is-on"); });
    window.addEventListener("blur", function () { ring.classList.remove("is-on"); });
  }

  // Respond on press, not on release. Cancel if the finger slides away.
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest ? e.target.closest(".btn") : null;
    if (!b) return;
    b.classList.add("is-pressed");
    var clear = function () { b.classList.remove("is-pressed"); };
    b.addEventListener("pointerup", clear, { once: true });
    b.addEventListener("pointercancel", clear, { once: true });
    b.addEventListener("pointerleave", clear, { once: true });
  }, { passive: true });

  // Keep the segmented thumb honest when the row reflows.
  var relayout = function () { if (picker) renderPicker(); };
  window.addEventListener("resize", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  window.addEventListener("load", relayout);
})();
