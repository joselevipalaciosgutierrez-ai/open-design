// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchProjectDelivery } from '../../src/state/delivery';

afterEach(() => vi.unstubAllGlobals());

const answer = (body: unknown, ok = true) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })));

describe('fetchProjectDelivery', () => {
  it('returns the delivery when the project has one', async () => {
    answer({ present: true, stages: [{ id: 'a' }], total: 1 });
    expect((await fetchProjectDelivery('p1'))?.total).toBe(1);
  });

  it('treats no file, a bad body, an error status and a network failure as no delivery', async () => {
    answer({ present: false, stages: [] });
    expect(await fetchProjectDelivery('p1')).toBeNull();
    answer({ present: true });
    expect(await fetchProjectDelivery('p1')).toBeNull();
    answer(null);
    expect(await fetchProjectDelivery('p1')).toBeNull();
    answer({}, false);
    expect(await fetchProjectDelivery('p1')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchProjectDelivery('p1')).toBeNull();
  });
});
