import { describe, expect, it } from 'vitest';
import { EventWriter, dedupe, type SiteRow } from '../lib/writer';

const row = (metricId: string, value = 1, siteId = 'site-a'): SiteRow => ({
  siteId, metricId, viewId: 'v', metric: 'LCP', value, path: '/', device: 'desktop', country: null,
  connection: null, release: null, target: null, resource: null, eventType: null,
});

describe('EventWriter', () => {
  it('coalesces concurrent requests into one INSERT', async () => {
    const batches: SiteRow[][] = [];
    const writer = new EventWriter({ write: async (rows) => void batches.push(rows), maxDelayMs: 10 });
    await Promise.all([writer.enqueue([row('a'), row('b')]), writer.enqueue([row('c')]), writer.enqueue([row('d')])]);
    expect(batches).toHaveLength(1);
    expect(batches[0].map((r) => r.metricId)).toEqual(['a', 'b', 'c', 'd']);
    expect(writer.stats).toMatchObject({ accepted: 4, written: 4, failed: 0, batches: 1 });
  });

  it('flushes immediately once a batch is full, and splits oversized flushes', async () => {
    const batches: number[] = [];
    const writer = new EventWriter({ write: async (rows) => void batches.push(rows.length), maxBatch: 3, maxDelayMs: 10_000 });
    await writer.enqueue([row('a'), row('b'), row('c'), row('d'), row('e')]);
    expect(batches).toEqual([3, 2]);
  });

  it('retries a failed write once before giving up', async () => {
    let calls = 0;
    const writer = new EventWriter({
      write: async () => {
        if (++calls === 1) throw new Error('connection reset');
      },
      maxDelayMs: 1,
      retryDelayMs: 1,
    });
    await expect(writer.enqueue([row('a')])).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it('rejects every waiter in a batch that fails twice', async () => {
    const writer = new EventWriter({ write: async () => { throw new Error('db down'); }, maxDelayMs: 1, retryDelayMs: 1 });
    const results = await Promise.allSettled([writer.enqueue([row('a')]), writer.enqueue([row('b')])]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(writer.stats.failed).toBe(2);
  });

  it('sheds load when the queue is full instead of growing without bound', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const writer = new EventWriter({ write: () => gate, maxQueued: 3, maxDelayMs: 1 });
    const first = writer.enqueue([row('a'), row('b')]);
    expect(first).not.toBeNull();
    expect(writer.enqueue([row('c'), row('d')])).toBeNull(); // would exceed 3
    expect(writer.stats.shed).toBe(2);
    release();
    await first;
    expect(writer.enqueue([row('e')])).not.toBeNull(); // room again once written
  });
});

describe('dedupe', () => {
  it('keeps the latest report of each metric instance', () => {
    const out = dedupe([row('a', 0.1), row('b'), row('a', 0.3), row('a', 1, 'site-b')]);
    expect(out.map((r) => [r.siteId, r.metricId, r.value])).toEqual([
      ['site-a', 'a', 0.3],
      ['site-a', 'b', 1],
      ['site-b', 'a', 1],
    ]);
  });
});
