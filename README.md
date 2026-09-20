# Next Leg Aircraft Detailing — website

Static marketing site plus one Worker route. Cloudflare serves everything in `public/` straight from the edge; the Worker only runs for `/api/lead` and the `/quote` redirect.

```
wrangler.toml     Worker + static assets config
src/index.js      the Worker: /api/lead, /quote, security headers
public/           the site — HTML, CSS, JS, icons, photos
```

## Deploy from GitHub (what this repo is set up for)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Workers** → **Import a repository**
2. Pick this repo. Cloudflare reads `wrangler.toml`, so leave the build settings alone:
   - Build command: *(empty)*
   - Deploy command: `npx wrangler deploy`
3. Deploy. Every push to `main` redeploys.

## Connect the estimate form to GoHighLevel

The form works and accepts submissions immediately. Until the webhook is set it returns success and logs the lead instead of delivering it — so nothing breaks and nothing is silently lost.

1. In GoHighLevel, create an inbound webhook trigger and copy the URL.
2. Cloudflare dashboard → your Worker → **Settings** → **Variables and Secrets** → add a **Secret** named `GHL_WEBHOOK_URL`.
3. Submit one test estimate, then map the fields in the GHL workflow:
   `first_name`, `last_name`, `email`, `phone`, `company_name`, `role`, `aircraft`, `aircraft_class`,
   `airport`, `timing`, `after_hours`, `date_needed`, `services`, `estimate_total`,
   `needs_manual_quote`, `notes`, `sms_consent`, `source`, `page`, `submitted_at`, `tags`

Watch live logs with `npx wrangler tail`.

## Custom domain

Worker → **Domains & Routes** → **Add** → Custom domain → `nextlegdetail.com`, then again for `www.nextlegdetail.com`. Cloudflare handles the DNS and the certificate as long as the domain is on your account.

## Deploy from your machine instead

```bash
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put GHL_WEBHOOK_URL
```

## Changing prices or copy

Don't hand-edit `public/`. Every price on the page comes from `_source/pricing_data.py` in the launch-kit folder — change it there and run `python3 _source/build_site.py`, which regenerates `website/public/` including the estimator's pricing table. Copy that over `public/` here and push.
