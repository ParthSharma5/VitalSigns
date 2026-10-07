export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  domain          text NOT NULL,
  public_key      text NOT NULL UNIQUE,
  alert_threshold real NOT NULL DEFAULT 0.2,
  webhook_url     text,
  alert_email     boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_user_idx ON sites (user_id);
-- Last beacon rejected because its origin didn't match the domain, shown on the install page.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rejected_origin text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE TABLE IF NOT EXISTS events (
  id         bigserial PRIMARY KEY,
  site_id    uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  metric_id  text NOT NULL,
  view_id    text NOT NULL,
  metric     text NOT NULL,
  value      double precision NOT NULL,
  path       text NOT NULL,
  device     text NOT NULL,
  country    text,
  connection text,
  release    text,
  target     text,
  resource   text,
  event_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, metric_id)
);
CREATE INDEX IF NOT EXISTS events_site_metric_time_idx ON events (site_id, metric, created_at);
ALTER TABLE events ADD COLUMN IF NOT EXISTS user_id text;
CREATE INDEX IF NOT EXISTS events_site_time_idx ON events (site_id, created_at);
CREATE INDEX IF NOT EXISTS events_site_view_idx ON events (site_id, view_id);

CREATE TABLE IF NOT EXISTS alerts (
  id          bigserial PRIMARY KEY,
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  metric      text NOT NULL,
  baseline    double precision NOT NULL,
  current     double precision NOT NULL,
  change      double precision NOT NULL,
  release     text,
  day         date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, metric, day)
);
`;
