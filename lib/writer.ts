import type { EventRow } from './ingest';

export type SiteRow = EventRow & { siteId: string };

type Waiter = { resolve: () => void; reject: (err: unknown) => void };

export type WriterOptions = {
  write: (rows: SiteRow[]) => Promise<void>;
  maxBatch?: number; // rows per INSERT
  maxDelayMs?: number; // how long a row may wait for others to share its INSERT
  maxQueued?: number; // rows buffered or in flight before we shed load
  retryDelayMs?: number;
};

// Group commit for beacons.
//
// Each beacon is a handful of rows. Writing each one as its own INSERT means
// one round trip and one transaction per page view, which is the first thing to
// fall over under load. Instead, rows from concurrent requests wait up to
// `maxDelayMs` and go out together as one multi-row INSERT.
//
// No data is acknowledged as written until the batch containing it commits:
// enqueue() returns a promise that settles with that batch. When the queue is
// full (the database is slower than traffic) enqueue() returns null so the
// route can answer 503 instead of growing memory without bound.
export class EventWriter {
  private queue: SiteRow[] = [];
  private waiters: Waiter[] = [];
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly opts: Required<WriterOptions>;

  readonly stats = { accepted: 0, written: 0, failed: 0, shed: 0, batches: 0 };

  constructor(opts: WriterOptions) {
    this.opts = { maxBatch: 500, maxDelayMs: 50, maxQueued: 20_000, retryDelayMs: 200, ...opts };
  }

  enqueue(rows: SiteRow[]): Promise<void> | null {
    if (rows.length === 0) return Promise.resolve();
    if (this.queue.length + this.inFlight + rows.length > this.opts.maxQueued) {
      this.stats.shed += rows.length;
      return null;
    }
    this.stats.accepted += rows.length;
    this.queue.push(...rows);
    const done = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));

    if (this.queue.length >= this.opts.maxBatch) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), this.opts.maxDelayMs);
    return done;
  }

  // Resolves once everything enqueued so far has been written (or failed).
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.queue.length === 0) return this.chain;

    const rows = this.queue;
    const waiters = this.waiters;
    this.queue = [];
    this.waiters = [];
    this.inFlight += rows.length;

    // Batches are written one after another so a slow database sees a steady
    // stream of large INSERTs rather than a pile of concurrent small ones.
    this.chain = this.chain.then(async () => {
      try {
        for (let i = 0; i < rows.length; i += this.opts.maxBatch) {
          await this.writeWithRetry(dedupe(rows.slice(i, i + this.opts.maxBatch)));
        }
        this.stats.written += rows.length;
        for (const w of waiters) w.resolve();
      } catch (err) {
        this.stats.failed += rows.length;
        for (const w of waiters) w.reject(err);
      } finally {
        this.inFlight -= rows.length;
      }
    });
    return this.chain;
  }

  private async writeWithRetry(rows: SiteRow[]) {
    this.stats.batches++;
    try {
      await this.opts.write(rows);
    } catch {
      await new Promise((r) => setTimeout(r, this.opts.retryDelayMs));
      await this.opts.write(rows);
    }
  }
}

// A page can send the same metric twice (CLS and INP grow while the page stays
// open, and every hide flushes). Postgres refuses to upsert the same key twice
// in one statement, so keep only the latest report per metric instance.
export function dedupe(rows: SiteRow[]): SiteRow[] {
  const byKey = new Map<string, SiteRow>();
  for (const row of rows) byKey.set(row.siteId + '\0' + row.metricId, row);
  return byKey.size === rows.length ? rows : [...byKey.values()];
}
