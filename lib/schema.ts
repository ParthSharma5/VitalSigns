// Idempotent schema, applied on first connection. Kept as plain SQL so the
// same statements run on PGlite (local) and hosted Postgres (production).
export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,               -- sha256 of the cookie token
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  domain          text NOT NULL,
  public_key      text NOT NULL UNIQUE,      -- goes in the script tag; not a secret
  alert_threshold real NOT NULL DEFAULT 0.2, -- fractional regression that fires an alert
  webhook_url     text,
  alert_email     boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_user_idx ON sites (user_id);

-- One row per metric instance. metric_id comes from web-vitals and is unique
-- per page load, so retried or repeated beacons upsert instead of double counting.
CREATE TABLE IF NOT EXISTS events (
  id         bigserial PRIMARY KEY,
  site_id    uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  metric_id  text NOT NULL,
  view_id    text NOT NULL,
  metric     text NOT NULL,                  -- LCP | INP | CLS | TTFB
  value      double precision NOT NULL,
  path       text NOT NULL,
  device     text NOT NULL,                  -- mobile | tablet | desktop
  country    text,
  connection text,
  release    text,
  target     text,                           -- element selector (LCP element, INP target, CLS shifter)
  resource   text,                           -- LCP resource URL
  event_type text,                           -- INP event type (click, keydown, ...)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, metric_id)
);
CREATE INDEX IF NOT EXISTS events_site_metric_time_idx ON events (site_id, metric, created_at);

CREATE TABLE IF NOT EXISTS alerts (
  id          bigserial PRIMARY KEY,
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  metric      text NOT NULL,
  baseline    double precision NOT NULL,
  current     double precision NOT NULL,
  change      double precision NOT NULL,     -- fractional, 0.4 = 40% worse
  release     text,
  day         date NOT NULL,                 -- dedupe: one alert per metric per site per day
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, metric, day)
);
`;
