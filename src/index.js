// Next Leg Aircraft Detailing — Cloudflare Worker
// Serves the static site from the ASSETS binding and handles the estimate form
// at POST /api/lead, forwarding it to a GoHighLevel inbound webhook.

const MAX = { name: 120, company: 160, role: 80, email: 160, phone: 40, notes: 2000, services: 1500, aircraft: 120, airport: 20, timing: 60, date_needed: 20, page: 300 };

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; " +
    "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...SECURITY_HEADERS },
  });
}

async function handleLead(request, env, ctx) {
  if (request.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  let data;
  try {
    const type = request.headers.get("content-type") || "";
    data = type.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "The form data couldn't be read." }, 400);
  }

  // Bots fill the hidden "website" field. Pretend it worked.
  if (data.website) return json({ ok: true });

  const clean = {};
  for (const [k, limit] of Object.entries(MAX)) clean[k] = String(data[k] ?? "").trim().slice(0, limit);
  if (!clean.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean.email) || clean.phone.replace(/\D/g, "").length < 10) {
    return json({ ok: false, error: "Name, a valid email and a 10-digit phone number are required." }, 422);
  }

  const [first, ...rest] = clean.name.split(/\s+/);
  const payload = {
    first_name: first,
    last_name: rest.join(" "),
    full_name: clean.name,
    email: clean.email,
    phone: clean.phone,
    company_name: clean.company,
    role: clean.role,
    aircraft: clean.aircraft,
    aircraft_class: String(data.aircraft_class ?? "").slice(0, 4),
    airport: clean.airport,
    timing: clean.timing,
    after_hours: Boolean(data.after_hours),
    date_needed: clean.date_needed,
    services: clean.services,
    estimate_total: Number(data.estimate_total) || 0,
    needs_manual_quote: Boolean(data.needs_manual_quote),
    notes: clean.notes,
    sms_consent: Boolean(data.sms_consent),
    source: "Website instant estimate",
    page: clean.page,
    submitted_at: new Date().toISOString(),
    tags: ["source-website", "stage-new-lead"],
  };

  if (!env.GHL_WEBHOOK_URL) {
    console.log("LEAD (no GHL_WEBHOOK_URL set):", JSON.stringify(payload));
    return json({ ok: true, demo: true });
  }

  try {
    const res = await fetch(env.GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("LEAD delivery failed", res.status, JSON.stringify(payload));
      return json({ ok: false, error: "The request couldn't be delivered." }, 502);
    }
  } catch (e) {
    console.error("LEAD delivery error", e && e.message, JSON.stringify(payload));
    return json({ ok: false, error: "The request couldn't be delivered." }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/lead") return handleLead(request, env, ctx);
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found." }, 404);

    if (url.pathname === "/quote") {
      return new Response(null, { status: 307, headers: { location: "/#quote", ...SECURITY_HEADERS } });
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    if (url.pathname.startsWith("/photos/")) headers.set("cache-control", "public, max-age=31536000, immutable");
    else if (url.pathname.startsWith("/assets/")) headers.set("cache-control", "public, max-age=3600");
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};
