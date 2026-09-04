import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gifService } from '../server/services/gifService.js';
import { gifCache } from '../server/services/gifCache.js';

// One Klipy result, in the shape the real API returns.
function klipyGif(id) {
  return {
    id,
    title: `GIF ${id}`,
    file: {
      hd: { gif: { url: `https://cdn.example/${id}-hd.gif` } },
      md: { gif: { url: `https://cdn.example/${id}-md.gif` } },
    },
  };
}

function klipyResponse(count, startAt = 0) {
  return {
    ok: true,
    json: async () => ({
      result: true,
      data: { data: Array.from({ length: count }, (_, i) => klipyGif(startAt + i)) },
    }),
  };
}

describe('gifService', () => {
  let fetchMock;

  beforeEach(() => {
    process.env.KLIPY_API_KEY = 'test-key';
    gifService.resetCache();
    fetchMock = vi.fn(async () => klipyResponse(30));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    gifCache.reset();
  });

  function queryOf(call) {
    return new URL(call[0]).searchParams;
  }

  it('maps the Klipy payload onto the shape the client expects', async () => {
    const [gif] = await gifService.search('cats', 1);
    expect(gif).toEqual({
      id: 0,
      url: 'https://cdn.example/0-hd.gif',
      preview: 'https://cdn.example/0-md.gif',
      title: 'GIF 0',
      source: 'klipy',
    });
  });

  it('sends the API key and the query to Klipy', async () => {
    await gifService.search('happy dance', 5);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/test-key/gifs/search');
    expect(url).toContain('q=happy+dance');
  });

  it('asks for a term\'s whole catalogue in one call, not just the first screen', async () => {
    // Klipy caps a search at 100 results, and one call gets all of them --
    // asking for 50 left half of every term permanently unreachable.
    await gifService.search('cats', 20);
    expect(queryOf(fetchMock.mock.calls[0]).get('per_page')).toBe('100');
  });

  it('pages past the first screen without another API call', async () => {
    fetchMock.mockResolvedValue(klipyResponse(100));
    const firstScreen = await gifService.search('cats', 24);
    const seen = firstScreen.map(g => String(g.id));
    const secondScreen = await gifService.search('cats', 24, seen);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondScreen).toHaveLength(24);
    expect(secondScreen.map(g => String(g.id)).some(id => seen.includes(id))).toBe(false);
  });

  it('serves a repeated search from cache instead of calling Klipy again', async () => {
    await gifService.search('cats', 10);
    await gifService.search('cats', 10);
    await gifService.search('CATS ', 10); // Normalised to the same query

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(gifService.getUsageStats().cacheHits).toBe(2);
  });

  it('excludes GIFs the player has already seen', async () => {
    // IDs arrive from the query string as strings; they used to be compared
    // against numeric ids and never matched.
    const results = await gifService.search('cats', 5, ['0', '1']);
    expect(results.map(g => g.id)).not.toContain(0);
    expect(results.map(g => g.id)).not.toContain(1);
    expect(results).toHaveLength(5);
  });

  it('honours the requested limit', async () => {
    expect(await gifService.search('cats', 3)).toHaveLength(3);
  });

  it('caches trending and only refetches when asked for fresh results', async () => {
    await gifService.getTrending(20);
    await gifService.getTrending(20);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await gifService.getTrending(20, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads a random trending page instead of always page 1', async () => {
    // Trending is ~66 pages deep. Only ever reading page 1 is why the same 50
    // GIFs came back forever.
    const pages = new Set();
    for (let i = 0; i < 25; i++) {
      await gifService.getTrending(20, true);
      pages.add(queryOf(fetchMock.mock.calls.at(-1)).get('page'));
    }

    expect(pages.size).toBeGreaterThan(1);
    for (const page of pages) {
      expect(Number(page)).toBeGreaterThanOrEqual(1);
      expect(Number(page)).toBeLessThanOrEqual(66);
    }
  });

  it('accumulates trending pages so random draws get deeper', async () => {
    let next = 0;
    fetchMock.mockImplementation(async () => klipyResponse(50, (next += 50)));

    await gifService.getTrending(20);
    await gifService.getTrending(20, true);
    await gifService.getTrending(20, true);

    // Three distinct pages of 50 are now available to shuffle, not one.
    expect(await gifService.getRandom(150)).toHaveLength(150);
  });

  it('falls back to stale trending when Klipy fails', async () => {
    await gifService.getTrending(20);
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const gifs = await gifService.getTrending(20, true);
    expect(gifs).toHaveLength(20);
  });

  it('reports a clear error when there is nothing cached to fall back on', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(gifService.getTrending(20)).rejects.toThrow('GIF service unavailable');
  });

  it('surfaces an HTTP failure from a search', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    await expect(gifService.search('cats')).rejects.toThrow('Klipy API error: 429');
  });

  it('reports a timeout as an upstream error rather than hanging', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    await expect(gifService.search('cats')).rejects.toThrow('Klipy API error: timeout');
  });

  it('falls back to the local pool when Klipy is unreachable', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kwim-fallback-'));
    try {
      await gifCache.init(dir);
      // The pool downloads the GIF bytes from the CDN, so the mock has to
      // answer both the Klipy API and the file URLs.
      fetchMock.mockImplementation(async url => (
        String(url).includes('api.klipy.com')
          ? klipyResponse(30)
          : {
            ok: true,
            headers: new Headers({ 'content-length': '4' }),
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([71, 73, 70, 56]));
                controller.close();
              },
            }),
          }
      ));

      // A normal search fills the pool as a side effect.
      await gifService.search('cats', 30);
      for (let i = 0; i < 2000 && gifCache.getStats().pending > 0; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      expect(gifCache.getStats().onDisk).toBeGreaterThan(0);

      gifService.resetCache();
      fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.klipy.com'));

      const offline = await gifService.search('cats', 10);
      expect(offline.length).toBeGreaterThan(0);
      expect(offline.every(gif => gif.source === 'local')).toBe(true);
      expect(offline[0].url).toMatch(/^local:/);
    } finally {
      await gifCache.shutdown();
      gifCache.reset();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('still reports the outage when the local pool has nothing to offer', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(gifService.search('nothing-cached-here')).rejects.toThrow('Klipy API error');
  });

  it('says so when no API key is configured', async () => {
    delete process.env.KLIPY_API_KEY;
    await expect(gifService.search('cats')).rejects.toThrow('KLIPY_API_KEY not configured');
  });

  it('builds random results from the cached trending pool without extra calls', async () => {
    await gifService.getTrending(50);
    fetchMock.mockClear();

    const random = await gifService.getRandom(10);
    expect(random).toHaveLength(10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a category as a search for that term', async () => {
    await gifService.getByCategory('animals', 5);
    expect(fetchMock.mock.calls[0][0]).toContain('q=animals');
  });

  it('exposes categories and an emoji map that agree with each other', () => {
    const categories = gifService.getCategories();
    const emojiMap = gifService.getEmojiMap();

    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('name');
      expect(emojiMap[cat.emoji]).toBe(cat.id);
    }
  });

  it('tracks calls, hits and a hit rate', async () => {
    await gifService.search('cats', 5);
    await gifService.search('cats', 5);

    const stats = gifService.getUsageStats();
    expect(stats.apiCalls).toBe(1);
    expect(stats.cacheHits).toBe(1);
    expect(stats.hitRate).toBe('50%');
    expect(stats.cachedQueries).toBe(1);
  });
});
