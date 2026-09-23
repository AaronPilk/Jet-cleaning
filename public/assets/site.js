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

  // ============================================================
  // Aircraft picker
  //
  // A vertical list of aircraft sizes, each drawn to scale; a finder for
  // people who know their model but not our size names; and a price panel
  // that follows whichever was chosen. The estimator further down is kept in
  // step, both ways, so nobody picks their aircraft twice.
  // ============================================================
  var fleet = $("fleet");
  var pickCls = P.defaultClass;
  var pickModel = null;
  var AC = P.aircraft || {};
  var qModel = $("q-model");
  var syncing = false;

  var modelCls = {};
  (P.models || []).forEach(function (m) { modelCls[m[0]] = m[1]; });

  var article = function (w) { return /^[aeiou]/i.test(w) ? "an" : "a"; };
  var classLabel = function (c) { return P.classes[c] ? P.classes[c].label : "Custom quote"; };

  // prices glide to their new values instead of snapping
  var priceEls = Array.prototype.map.call(document.querySelectorAll("#menu [data-price]"), function (el) {
    return { el: el, code: el.getAttribute("data-price"), set: springNumber(el, fmt), quoted: false };
  });
  var programEls = Array.prototype.map.call(document.querySelectorAll("#program-rows [data-program]"), function (el) {
    return { el: el, key: el.getAttribute("data-program"), set: springNumber(el, fmt) };
  });

  function renderPrices() {
    priceEls.forEach(function (p) {
      var v = unitPrice(p.code, pickCls);
      if (v === null) { p.el.textContent = "Quoted"; p.quoted = true; }
      else { p.quoted = false; p.set(v); }
    });
    var pc = $("program-class");
    if (pc) pc.textContent = classLabel(pickCls);
    var pr = P.programs[pickCls];
    programEls.forEach(function (p) {
      var v = pr ? pr[p.key] : null;
      if (v) p.set(v); else p.el.textContent = "Quoted";
    });
  }

  // ---- the list
  var list = $("fleet-list");
  var tiles = list ? Array.prototype.slice.call(list.querySelectorAll("[data-cls]")) : [];

  function renderTiles() {
    var any = false;
    tiles.forEach(function (b) {
      var on = b.getAttribute("data-cls") === pickCls;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      if (on) any = true;
    });
    if (!any && tiles[0]) tiles[0].tabIndex = 0;
  }

  // ---- the heading over the prices
  function renderHead() {
    var t = $("fleet-title"), s = $("fleet-sub");
    if (!t || !s) return;
    var label = classLabel(pickCls);
    if (pickModel) {
      t.textContent = pickModel;
      s.textContent = pickCls === "Q"
        ? "Larger than anything on our list. We price it by hand after a walkaround."
        : "Priced as " + article(label) + " " + label.toLowerCase() + ".";
    } else {
      t.textContent = label;
      s.textContent = P.classes[pickCls] ? "Typical in this size: " + P.classes[pickCls].typical + "." : "";
    }
  }

  // ---- the drawing: two layers cross-fade while one width spring carries
  // the size change, so a light jet grows into a large cabin rather than
  // being swapped for it.
  var craft = fleet ? fleet.querySelector(".fleet__craft") : null;
  var arts = craft ? craft.querySelectorAll(".fleet__art") : [];
  var front = 0;
  var widthSpring = craft ? new Spring(AC[pickCls] ? AC[pickCls].pct : 50, {
    damping: 1, response: 0.46,
    onFrame: function (v) { craft.style.width = v.toFixed(2) + "%"; }
  }) : null;
  if (widthSpring && AC[pickCls]) widthSpring.snap(AC[pickCls].pct);

  function drawCraft(cls) {
    if (!craft || arts.length < 2) return;
    var key = AC[cls] ? cls : "C6";
    var m = AC[key];
    var cur = arts[front];
    if (cur.getAttribute("data-cls") !== key) {
      var nxt = arts[1 - front];
      nxt.setAttribute("viewBox", m.box);
      nxt.setAttribute("data-cls", key);
      var use = nxt.querySelector("use");
      if (use) use.setAttribute("href", "#acx-" + key);
      nxt.classList.add("is-front");
      cur.classList.remove("is-front");
      front = 1 - front;
    }
    craft.classList.toggle("is-custom", cls === "Q");
    widthSpring.set(m.pct);
  }

  // ---- keep the estimator on the same aircraft
  function syncEstimator() {
    if (!qModel) return;
    var want = null;
    if (pickModel && modelCls[pickModel]) want = pickModel;
    else if (modelCls[qModel.value] !== pickCls && P.classes[pickCls]) want = P.classes[pickCls].rep;
    if (!want || want === qModel.value) return;
    qModel.value = want;
    syncing = true;
    qModel.dispatchEvent(new Event("change", { bubbles: true }));
    syncing = false;
  }

  function select(cls, model, opts) {
    opts = opts || {};
    pickCls = cls;
    pickModel = model || null;
    renderTiles();
    renderHead();
    renderPrices();
    drawCraft(cls);
    if (!opts.fromEstimator) syncEstimator();
    if (!opts.keepQuery && finder.input) {
      finder.input.value = pickModel || "";
      finder.toggleClear();
    }
  }

  if (list) {
    list.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cls]");
      if (b) select(b.getAttribute("data-cls"), null);
    });
    // A radio group: arrows move the choice, Home and End jump to the ends.
    list.addEventListener("keydown", function (e) {
      var keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      var i = tiles.findIndex(function (b) { return b.getAttribute("data-cls") === pickCls; });
      var j;
      if (e.key in keys) j = ((i < 0 ? 0 : i) + keys[e.key] + tiles.length) % tiles.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tiles.length - 1;
      else return;
      e.preventDefault();
      select(tiles[j].getAttribute("data-cls"), null);
      tiles[j].focus();
    });
  }

  if (qModel) {
    qModel.addEventListener("change", function () {
      if (syncing) return;
      var c = modelCls[qModel.value];
      if (c) select(c, qModel.value, { fromEstimator: true });
    });
  }

  // ---- the finder: a combobox over every model we price
  var finder = (function () {
    var input = $("finder-input"), pop = $("finder-list");
    var clear = fleet ? fleet.querySelector(".finder__clear") : null;
    var api = { input: input, toggleClear: function () { if (clear) clear.hidden = !(input && input.value); } };
    if (!input || !pop) return api;

    var norm = function (s) { return s.toLowerCase().replace(/[‐-―-]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); };
    var index = (P.models || []).filter(function (m) { return !/^other/i.test(m[0]); }).map(function (m, i) {
      var toks = norm(m[0]).split(" ").filter(Boolean);
      toks.slice().forEach(function (t) {
        var g = /^[a-z]{1,2}(\d{2,4}[a-z]*)$/.exec(t);
        if (g) toks.push(g[1]);
      });
      return { name: m[0], cls: m[1], toks: toks, i: i };
    });

    function search(q) {
      var qt = norm(q).split(" ").filter(Boolean);
      if (!qt.length) return [];
      var out = [];
      index.forEach(function (it) {
        var score = 0;
        for (var k = 0; k < qt.length; k++) {
          var best = 0;
          for (var j = 0; j < it.toks.length; j++) {
            var t = it.toks[j];
            if (t === qt[k]) best = Math.max(best, 3);
            else if (t.indexOf(qt[k]) === 0) best = Math.max(best, 2);
            else if (qt[k].length > 2 && t.indexOf(qt[k]) > 0) best = Math.max(best, 1);
          }
          if (!best) return;
          score += best;
        }
        out.push({ it: it, score: score });
      });
      out.sort(function (a, b) { return b.score - a.score || a.it.i - b.it.i; });
      return out.slice(0, 7).map(function (o) { return o.it; });
    }

    var items = [], active = -1;

    function highlight(el, name, q) {
      var parts = q.trim().split(/\s+/).filter(Boolean).map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
      if (!parts.length) { el.textContent = name; return; }
      var re = new RegExp("(" + parts.join("|") + ")", "ig");
      name.split(re).forEach(function (chunk, i) {
        if (!chunk) return;
        if (i % 2) { var m = document.createElement("mark"); m.textContent = chunk; el.appendChild(m); }
        else el.appendChild(document.createTextNode(chunk));
      });
    }

    function open(q) {
      items = search(q);
      pop.innerHTML = "";
      active = -1;
      if (!q.trim()) { close(); return; }
      if (!items.length) {
        var none = document.createElement("li");
        none.className = "finder__none";
        none.setAttribute("role", "presentation");
        none.textContent = "Not on our list. Pick the closest size below, or send it in the estimate and we'll price it by hand.";
        pop.appendChild(none);
      }
      items.forEach(function (it, i) {
        var li = document.createElement("li");
        li.id = "finder-opt-" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        var nm = document.createElement("span");
        nm.className = "finder__model";
        highlight(nm, it.name, q);
        var cl = document.createElement("span");
        cl.className = "finder__cls";
        cl.textContent = it.cls === "Q" ? "Quoted by hand" : classLabel(it.cls);
        li.appendChild(nm);
        li.appendChild(cl);
        // pointerdown, not click: keep focus in the field and answer on press
        li.addEventListener("pointerdown", function (e) { e.preventDefault(); pick(it); });
        pop.appendChild(li);
      });
      pop.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function close() {
      pop.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    }

    function move(d) {
      if (!items.length) return;
      active = (active + d + items.length) % items.length;
      Array.prototype.forEach.call(pop.querySelectorAll("[role=option]"), function (li, i) {
        li.setAttribute("aria-selected", i === active ? "true" : "false");
        if (i === active) li.scrollIntoView({ block: "nearest" });
      });
      input.setAttribute("aria-activedescendant", "finder-opt-" + active);
    }

    // On a phone the prices sit below eight tiles. Someone who typed their
    // model wants the answer, so take them to it (tiles don't do this: people
    // tap through those to compare).
    var stacked = window.matchMedia && window.matchMedia("(max-width: 980px)");
    function reveal() {
      var panel = fleet && fleet.querySelector(".fleet__panel");
      if (!panel || !stacked || !stacked.matches) return;
      var top = panel.getBoundingClientRect().top;
      if (top > 0 && top < window.innerHeight * 0.55) return;
      input.blur();
      panel.scrollIntoView({ block: "start", behavior: reduce && reduce.matches ? "auto" : "smooth" });
    }

    function pick(it) {
      close();
      select(it.cls, it.name, { keepQuery: true });
      input.value = it.name;
      api.toggleClear();
      reveal();
    }

    input.addEventListener("input", function () { api.toggleClear(); open(input.value); });
    input.addEventListener("focus", function () { if (input.value && input.value !== pickModel) open(input.value); });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (pop.hidden) open(input.value); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        if (!pop.hidden && items.length) { e.preventDefault(); pick(items[active < 0 ? 0 : active]); }
      } else if (e.key === "Escape") {
        if (!pop.hidden) { e.preventDefault(); close(); }
        else if (input.value) { e.preventDefault(); input.value = ""; api.toggleClear(); if (pickModel) select(pickCls, null); }
      }
    });
    if (clear) {
      clear.addEventListener("click", function () {
        input.value = "";
        api.toggleClear();
        if (pickModel) select(pickCls, null);
        input.focus();
      });
    }
    return api;
  })();

  if (fleet) {
    renderTiles();
    renderHead();
    renderPrices();
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
    lines.forEach(function (l, i) {
      var li = document.createElement("li");
      var a = document.createElement("span");
      var b = document.createElement("span");
      a.textContent = l[0];
      b.textContent = l[1] === null ? "quote" : fmt(l[1]);
      li.appendChild(a);
      li.appendChild(b);
      li.className = "is-new";
      li.style.transitionDelay = Math.min(i, 6) * 32 + "ms";
      list.appendChild(li);
    });
    // Two frames: one to let the browser see the start state, one to leave it.
    // Setting both in the same frame means no transition at all.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(list.children, function (li) {
          li.classList.remove("is-new");
          li.classList.add("is-settled");
        });
      });
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
  // ---- validation that speaks up where the problem is, after you leave
  // the field, and shuts up the moment you start fixing it.
  var RULES = {
    "f-name":  { test: function (v) { return v.trim().length > 1; }, msg: "We need a name to put on the job card." },
    "f-email": { test: function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()); }, msg: "That email does not look right." },
    "f-phone": { test: function (v) { return v.replace(/\D/g, "").length >= 10; }, msg: "Ten digits, so we can call about the tail time." }
  };
  function fieldOf(el) { return el.closest ? el.closest(".field") : null; }
  function setBad(el, bad, msg) {
    var f = fieldOf(el);
    if (!f) return;
    f.classList.toggle("is-bad", !!bad);
    el.setAttribute("aria-invalid", bad ? "true" : "false");
    var p = f.querySelector(".fielderr");
    if (bad) {
      if (!p) {
        p = document.createElement("p");
        p.className = "fielderr";
        p.id = el.id + "-err";
        f.appendChild(p);
      }
      p.textContent = msg;
      el.setAttribute("aria-describedby", p.id);
    } else if (p) {
      el.removeAttribute("aria-describedby");
    }
  }
  function check(id) {
    var el = $(id), rule = RULES[id];
    if (!el || !rule) return true;
    var good = rule.test(el.value);
    setBad(el, !good, rule.msg);
    return good;
  }
  Object.keys(RULES).forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("blur", function () { if (el.value.trim()) check(id); });
    el.addEventListener("input", function () {
      var f = fieldOf(el);
      if (f && f.classList.contains("is-bad")) check(id);
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = $("f-status");
    var btn = $("f-submit");
    var name = $("f-name").value.trim();
    var email = $("f-email").value.trim();
    var phone = $("f-phone").value.trim();
    var bad = ["f-name", "f-email", "f-phone"].filter(function (id) { return !check(id); });
    if (bad.length) {
      status.className = "formstatus err";
      status.textContent = "Three things are missing or wrong below. They are marked.";
      var first = $(bad[0]);
      if (bad.length === 1) status.textContent = "One thing needs fixing below. It is marked.";
      if (first && first.focus) { first.focus(); first.scrollIntoView({ block: "center", behavior: slow ? "auto" : "smooth" }); }
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
    // The button carries the state so the person is not reading a sentence
    // somewhere else to find out whether anything happened.
    var setState = function (state) {
      btn.classList.remove("is-busy", "is-done");
      if (state) btn.classList.add(state);
      btn.disabled = state === "is-busy";
    };
    setState("is-busy");
    status.className = "formstatus";
    status.textContent = "";

    if (DEMO) {
      setTimeout(function () {
        setState("is-done");
        status.className = "formstatus ok";
        status.textContent = "Preview only: on the live site this request goes straight into your GoHighLevel pipeline.";
        setTimeout(function () { setState(null); }, 2600);
      }, 700);
      return;
    }

    fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || "Send failed");
        setState("is-done");
        status.className = "formstatus ok";
        status.textContent = "Sent. We'll confirm availability and your final price shortly.";
      })
      .catch(function () {
        setState(null);
        status.className = "formstatus err";
        status.textContent = "That didn't go through. Call (704) 877-3511 or email hello@nextlegdetail.com and we'll take it from there.";
      })
      .then(function () { if (!btn.classList.contains("is-done")) setState(null); });
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
  var finePointer = function () {
    return !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  };
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

  // ---- one scroll listener for everything that tracks the scroll
  // Separate listeners each doing their own getBoundingClientRect is how a
  // page starts dropping frames. One rAF-gated pass, one layout read.
  var rail = document.querySelector(".progress");
  var shots = Array.prototype.slice.call(document.querySelectorAll(".shot.reveal"));
  var parallax = !slow && shots.length;
  if (rail || parallax) {
    var vh = window.innerHeight;
    var pending = false;
    var pass = function () {
      pending = false;
      if (rail) {
        var max = document.documentElement.scrollHeight - vh;
        var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        rail.style.transform = "scaleX(" + p.toFixed(4) + ")";
      }
      if (!parallax) return;
      for (var i = 0; i < shots.length; i++) {
        var el = shots[i];
        var img = el.firstElementChild;
        if (!img || img.tagName !== "IMG") continue;
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        // -1 at the bottom of the window, +1 at the top. The image drifts
        // against the scroll by a fraction of its own overscan.
        var t = ((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2);
        img.style.setProperty("--py", (t * -26).toFixed(2) + "px");
      }
    };
    var onScroll = function () { if (!pending) { pending = true; requestAnimationFrame(pass); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { vh = window.innerHeight; onScroll(); }, { passive: true });
    pass();
  }

  // ---- the fee chips arrive in order
  var fees = document.querySelector(".fees");
  if (fees) {
    Array.prototype.forEach.call(fees.children, function (c, i) { c.style.setProperty("--i", i); });
    io2(fees, function (el) { el.classList.add("is-in"); });
    setTimeout(function () { fees.classList.add("is-in"); }, 4000);
  }

  // ---- the price cards catch the light where the pointer is
  var cards = document.querySelectorAll(".menu li");
  if (cards.length && !slow && finePointer()) {
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
      }, { passive: true });
    });
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
    var b = e.target.closest ? e.target.closest(".btn, .menu li, .svc label, .fleet__opt") : null;
    if (!b) return;
    b.classList.add("is-pressed");
    var clear = function () { b.classList.remove("is-pressed"); };
    b.addEventListener("pointerup", clear, { once: true });
    b.addEventListener("pointercancel", clear, { once: true });
    b.addEventListener("pointerleave", clear, { once: true });
  }, { passive: true });

})();
