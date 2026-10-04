# VitalSigns

Real-user Core Web Vitals monitoring for any website. Paste one script tag and see how fast your site actually is for the people using it: LCP, INP and CLS by page, device and country, with alerts when a deploy makes things worse.

## Quick start

Requires Node 24. No database to install: local development uses [PGlite](https://pglite.dev) (Postgres compiled to WASM, stored in `.data/pglite`).

```bash
npm install
npm run seed     # demo account with 30 days of synthetic traffic
npm run dev      # http://localhost:3000
```

Log in as `demo@vitalsigns.dev` / `demo-password`. The demo data contains deliberate problems for the dashboard to find (an unoptimised product image, a slow checkout button, a shifting ad banner, a slow search backend) and a release 20 hours ago that triggers a regression alert.

PGlite allows one process per data directory, so stop `npm run dev` before running `npm run seed`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Builds the snippet, then starts Next.js in dev mode |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests plus integration tests against an in-memory Postgres |
| `npm run typecheck` / `npm run lint` | Type checking and ESLint |
| `npm run build:snippet` | Builds `public/v1.js` and the collector, failing if they exceed their size budgets |
| `npm run seed` | Resets the demo account and its data |

## How it works

```text
visitor's browser                        VitalSigns (Next.js)                       Postgres
──────────────────                       ────────────────────                       ────────
v1.js loader (252 B gz)
  └─ injects v1-core.<hash>.js
     (web-vitals + batching, 4 KB gz,
      async, fetchpriority=low)
        │ one beacon per page view,
        │ sent when the page is hidden
        ▼
POST /api/collect  ──validate, drop bots, origin check──▶ EventWriter ──group commit──▶ events
                                                          (batches rows from many         (upsert on
                                                           concurrent requests into        metric id)
                                                           one INSERT … unnest())
dashboard  ◀── p75 / percentile_cont queries ───────────────────────────────────────────── events
cron (hourly) ── /api/cron/alerts ── compare last 24h vs the 24h before ──▶ alerts ──▶ email / Slack webhook
```

### The snippet (`snippet/`)

- **The pasted tag is 252 bytes gzipped.** It only injects the collector, an async script at low fetch priority, so it never competes with the host page's critical requests.
- **The collector** is Google's [web-vitals](https://github.com/GoogleChrome/web-vitals) library plus about 1 KB of batching and attribution code, 4 KB gzipped. Its filename is content-hashed and served `immutable`, while the loader has a one-hour cache, so new collector versions roll out within an hour without cache-busting anyone's HTML.
- **One beacon per page view**, sent with `sendBeacon` on `visibilitychange`/`pagehide` as `text/plain`, so there's no CORS preflight. Metrics are queued by id, so a growing CLS or INP value replaces the earlier report.
- **Lightweight attribution**: the LCP element and resource URL, the INP event type and target, and the element behind the largest layout shift. This is what powers the fix suggestions.
- `npm run build:snippet` fails the build if the loader goes over 2 KB or the collector over 5 KB gzipped.

Optional attributes: `data-release="v2.3.1"` (alerts then name the release), and `data-sample="0.25"` to measure only a fraction of visits.

### Ingest (`app/api/collect`, `lib/ingest.ts`, `lib/writer.ts`)

- **Validation and normalisation**: an 8 KB body cap and zod schema. Unknown metrics and implausible values are dropped individually rather than rejecting the whole beacon. Bots and lab tools are filtered. Paths are normalised (`/orders/8812` becomes `/orders/:id`, query strings are stripped). Device comes from the user agent and country from CDN headers.
- **Group commit**: rows from concurrent requests wait up to 50 ms and are written together as one `INSERT … SELECT FROM unnest(...)`. That's a fixed 13 parameters regardless of batch size, so every batch uses the same query plan. The route answers `202` immediately, and `after()` keeps the function alive until that batch commits. Failed writes retry once.
- **Idempotent**: `UNIQUE (site_id, metric_id)` plus `ON CONFLICT DO UPDATE`, so retried or repeated beacons upsert instead of double counting. Duplicates within a batch are removed first, because Postgres refuses to upsert the same key twice in one statement.
- **Backpressure**: when 20,000 rows are queued or in flight, the endpoint returns `503` instead of growing memory without bound.
- **Site lookups** are cached in memory for 60 s, including negative lookups, so junk keys can't hammer the database.
- `GET /api/health` reports accepted / written / failed / shed rows and the batch count.

Measured locally on the production build (one Node process, embedded PGlite): **3,000 beacons (9,000 rows) at concurrency 100 in 3.3 s, about 900 req/s, written in 31 INSERTs with no failures.**

### Dashboard (`lib/queries.ts`, `app/dashboard`)

Every number is the 75th percentile (`percentile_cont(0.75)`), the same statistic Google uses for Core Web Vitals. The dashboard shows:

- Stat tiles with the change against the previous period and a good / needs-work / poor split
- Hourly or daily trend charts
- The slowest pages
- Device and country breakdowns
- Fix suggestions
- Alert history

Filters for range (24h / 7d / 30d) and device apply to everything on the page. The charts are hand-written SVG, with no charting library.

### Alerts (`lib/alerts.ts`)

Each hour, every site's p75 for the last 24 hours is compared with the 24 hours before. An alert fires only when:

- each window has at least 30 samples,
- the relative change passes the site's threshold (20% by default), and
- the absolute change is large enough to matter, so CLS going from 0.01 to 0.02 is not reported as "100% worse".

When the most common `data-release` differs between the two windows, the alert names it: *"LCP got 41% worse since release v1.5.0 on acme.example: p75 2.98 s → 4.19 s (poor)"*. Alerts are unique per site, metric and day, so the hourly check only notifies once. Notifications go to a Slack-compatible webhook and, if `RESEND_API_KEY` is set, by email.

### Fix suggestions (`lib/suggestions.ts`)

For the slowest pages, the samples that missed the "good" threshold are grouped to find the dominant culprit: the LCP element and resource, the slow interaction's event type and target, and the element that shifted. Rules turn those into specific advice. For example: preload this exact image URL with `fetchpriority="high"` and serve it as AVIF; reserve space for `div.ad-banner`; or the server is the bottleneck (TTFB).

The suggestions are deterministic and rule-based. An AI-generated version is **on hold**. Suggestions go through a `SuggestionProvider` interface, so a model-backed provider can be added later in `getSuggestionProvider()`.

### Auth (`lib/auth.ts`, `proxy.ts`)

- Email and password, hashed with scrypt from `node:crypto`.
- Database sessions: the cookie holds a random token and only its SHA-256 is stored.
- `proxy.ts` does a fast cookie-presence redirect for `/dashboard`. The real check runs against the database in the dashboard layout.
- Every site query includes the owner's id, so another user's site is a 404.
- Alert webhook URLs must be public `https://` addresses, which blocks localhost, private IPs and cloud metadata endpoints.

## Deploying

1. Create a Postgres database (Neon, Supabase, RDS…) and set `DATABASE_URL`. The schema is applied automatically on first connection.
2. Set `APP_URL`, `CRON_SECRET`, and optionally `RESEND_API_KEY` / `ALERT_FROM_EMAIL` (see `.env.example`).
3. Deploy. On Vercel, `vercel.json` schedules `/api/cron/alerts` once a day, the most the free Hobby plan allows. For hourly checks, add `APP_URL` and `CRON_SECRET` as GitHub repository secrets and `.github/workflows/alerts-cron.yml` calls it every hour. Elsewhere, call it hourly with `Authorization: Bearer $CRON_SECRET`.

On Netlify, import the repo with the default Next.js settings, set the same environment variables, and use the GitHub Actions workflow for the alert check (Netlify ignores `vercel.json`).

Production should use the CDN's country header: Vercel's `x-vercel-ip-country`, Netlify's `x-country`, `cf-ipcountry` and CloudFront's are read automatically. Without one, country shows as Unknown.

## Project layout

```text
snippet/           browser code: loader.ts (the pasted tag) and core.ts (collector)
scripts/           build-snippet.mjs (bundling + size budgets), seed.ts (demo data)
app/api/collect    beacon ingest endpoint
app/api/cron       hourly alert check
app/dashboard      sites list, per-site overview, install & settings
lib/               db, schema, ingest, writer, queries, alerts, suggestions, auth
components/        UI and SVG charts
tests/             vitest: unit tests + integration tests on in-memory Postgres
```

## Known limitations and next steps

- **Alerts are site-wide.** A regression on a single low-traffic page can be diluted below the threshold. Per-page alerting for the top pages is the natural next step.
- **Raw events only.** Queries aggregate raw rows, which is fine into the millions of events per site. Beyond that, add hourly rollup tables (or a column store such as ClickHouse) and a retention job.
- **Visitors who leave before the collector loads are missed.** The collector is injected async, so a visitor who leaves within the first few hundred milliseconds may not be measured. This trades a little data on the very slowest bounces for zero impact on the host page.
- **No rate limiting** on login or ingest beyond the writer's backpressure. Put the app behind a CDN or WAF with rate rules in production.
- **The in-memory write buffer** holds at most 50 ms of rows. A process crash in that window loses them, although `after()` keeps serverless functions alive until the write completes.
- **AI-generated fix suggestions** are on hold; see above.
