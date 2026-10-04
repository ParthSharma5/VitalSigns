import type { EventRow } from './ingest';

export type SiteRow = EventRow & { siteId: string };

type Waiter = { resolve: () => void; reject: (err: unknown) => void };

export type WriterOptions = {
  write: (rows: SiteRow[]) => Promise<void>;
  maxBatch?: number;
  maxDelayMs?: number;
  maxQueued?: number;
  retryDelayMs?: number;
};

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

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.queue.length === 0) return this.chain;

    const rows = this.queue;
    const waiters = this.waiters;
    this.queue = [];
    this.waiters = [];
    this.inFlight += rows.length;

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

export function dedupe(rows: SiteRow[]): SiteRow[] {
  const byKey = new Map<string, SiteRow>();
  for (const row of rows) byKey.set(row.siteId + '\0' + row.metricId, row);
  return byKey.size === rows.length ? rows : [...byKey.values()];
}
