# Next Leg Aircraft Detailing — website

The live site is **https://nextlegdetail.com**, served from Vercel. This repo is the same site in Cloudflare Pages form, kept in step with it, so you can move hosts at any time without rebuilding anything.

Pages: home, `/pricing`, `/aircraft-detailing` plus six area pages, four service pages under `/services/`, `/privacy`. Cloudflare serves `pricing.html` at `/pricing` on its own. The `*.pages.dev` copies send `noindex`, so search engines only ever see nextlegdetail.com.

```
wrangler.toml          Pages config — declares public/ as the output directory
public/                the site: HTML, CSS, JS, icons, photos
public/_headers        security headers and cache rules
public/_redirects      /quote -> /#quote
functions/api/lead.js  Pages Function: POST /api/lead
src/index.js           not used here — the same site as a standalone Worker, kept for reference
```

## How it deploys

Cloudflare Pages is connected to this repo. Every push to `main` builds and deploys.
`pages_build_output_dir` in `wrangler.toml` tells Pages to serve `public/`, so there is
nothing to configure in the dashboard — leave the build command empty.

## Connect the estimate form to GoHighLevel

The form works and accepts submissions right now. Until the webhook is set it returns
success and logs the lead instead of delivering it, so nothing breaks and nothing is
silently lost.

1. In GoHighLevel, create an inbound webhook trigger and copy the URL.
2. Cloudflare dashboard → **Workers & Pages** → **jet-cleaning** → **Settings** →
   **Variables and Secrets** → add a **Secret** named `GHL_WEBHOOK_URL`.
3. Redeploy, submit one test estimate, then map the fields in the GHL workflow:
   `first_name`, `last_name`, `email`, `phone`, `company_name`, `role`, `aircraft`,
   `aircraft_class`, `airport`, `timing`, `after_hours`, `date_needed`, `services`,
   `estimate_total`, `needs_manual_quote`, `notes`, `sms_consent`, `source`, `page`,
   `submitted_at`, `tags`

Live logs: `npx wrangler pages deployment tail --project-name jet-cleaning`

## Custom domain

`nextlegdetail.com` points at Vercel today (GoDaddy DNS: `A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com`). Only move it here if you retire the Vercel project: add the domain under the Pages project → **Custom domains**, then change those two records to what Cloudflare shows.

## Run it locally

```bash
npm install
npx wrangler pages dev
```

Serves the real Pages runtime on http://localhost:8788 — static files, `_headers`,
`_redirects` and the function, behaving exactly as they do in production.

## Changing prices or copy

Don't hand-edit `public/`. Prices come from `_source/pricing_data.py` in the launch-kit
folder, the inner pages from `_source/site_pages.py`, the home page from `_source/site/`.
Ask Claude to rebuild: it regenerates `website/public/`, copies it over `public/` here and
redeploys the live site.
