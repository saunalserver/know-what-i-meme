import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { gifCache } from '../server/services/gifCache.js';

function klipyGif(id, title = `GIF ${id}`) {
  return {
    id,
    title,
    url: `https://cdn.example/${id}-hd.gif`,
    preview: `https://cdn.example/${id}-md.gif`,
    source: 'klipy',
  };
}

// Wait for the background download queue to drain.
async function settle() {
  for (let i = 0; i < 2000; i++) {
    if (gifCache.getStats().pending === 0) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('download queue never drained');
}

function bodyOfSize(bytes) {
  const chunk = new Uint8Array(bytes).fill(71); // 'G'
  return {
    ok: true,
    headers: new Headers({ 'content-length': String(bytes) }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    }),
  };
}

describe('local GIF pool', () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kwim-gifpool-'));
    vi.stubGlobal('fetch', vi.fn(async () => bodyOfSize(1024)));
  });

  afterEach(async () => {
    await gifCache.shutdown();
    gifCache.reset();
    vi.unstubAllGlobals();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('stays completely switched off without GIF_CACHE_DIR', async () => {
    expect(await gifCache.init(undefined)).toBe(false);
    expect(gifCache.isEnabled()).toBe(false);

    // Every entry point has to be safe to call anyway -- gifService always does.
    gifCache.remember('cats', [klipyGif(1)]);
    expect(gifCache.search('cats')).toEqual([]);
    expect(gifCache.random(10)).toEqual([]);
    expect(gifCache.resolve('1.gif')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('remembers every result of a search, not just the picked one', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', [klipyGif(1), klipyGif(2), klipyGif(3)]);
    await settle();

    expect(gifCache.getStats().known).toBe(3);
    expect(gifCache.getStats().onDisk).toBe(3);
    expect(await fs.readdir(path.join(dir, 'files'))).toHaveLength(3);
  });

  it('downloads each GIF once, however often it comes back', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', [klipyGif(1)]);
    await settle();
    gifCache.remember('kittens', [klipyGif(1)]);
    await settle();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    // ...but the second query is recorded, so searching for it finds the GIF.
    expect(gifCache.search('kittens').map(g => g.id)).toEqual(['1']);
  });

  it('ranks offline results by how well they match', async () => {
    await gifCache.init(dir);
    gifCache.remember('dancing cat', [klipyGif(1, 'A cat dancing badly')]);
    gifCache.remember('dog', [klipyGif(2, 'Good dog')]);
    await settle();

    const hits = gifCache.search('dancing cat', 10);
    expect(hits.map(g => g.id)).toEqual(['1']);
    expect(hits[0]).toMatchObject({ source: 'local', url: 'local:1.gif', preview: 'local:1.gif' });

    expect(gifCache.search('dog', 10).map(g => g.id)).toEqual(['2']);
    expect(gifCache.search('helicopter', 10)).toEqual([]);
  });

  it('honours the exclude list and the limit', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', [klipyGif(1), klipyGif(2), klipyGif(3)]);
    await settle();

    expect(gifCache.search('cats', 2)).toHaveLength(2);
    expect(gifCache.search('cats', 10, ['1']).map(g => g.id)).not.toContain('1');
  });

  it('never offers a GIF whose bytes failed to arrive', async () => {
    await gifCache.init(dir);
    global.fetch.mockResolvedValue({ ok: false, status: 404, headers: new Headers() });

    gifCache.remember('cats', [klipyGif(1)]);
    await settle();

    expect(gifCache.getStats().known).toBe(1);   // metadata kept
    expect(gifCache.getStats().onDisk).toBe(0);  // but not served
    expect(gifCache.search('cats')).toEqual([]);
  });

  it('skips files bigger than the per-file limit', async () => {
    await gifCache.init(dir);
    global.fetch.mockResolvedValue(bodyOfSize(9e6));

    gifCache.remember('cats', [klipyGif(1)]);
    await settle();

    expect(gifCache.getStats().onDisk).toBe(0);
    expect(await fs.readdir(path.join(dir, 'files'))).toEqual([]);
  });

  it('evicts the least recently seen GIFs to stay under its cap', async () => {
    // Cap of 3 KB with 1 KB files: room for three.
    await gifCache.init(dir, 3072 / 1e9);

    gifCache.remember('alpha', [klipyGif(1, 'alpha')]);
    await settle();
    gifCache.remember('bravo', [klipyGif(2, 'bravo')]);
    await settle();
    gifCache.remember('charlie', [klipyGif(3, 'charlie')]);
    await settle();
    gifCache.remember('delta', [klipyGif(4, 'delta')]);
    await settle();

    const stats = gifCache.getStats();
    expect(stats.bytes).toBeLessThanOrEqual(3 * 1024);
    expect(stats.evictions).toBeGreaterThan(0);
    // The oldest went first.
    expect(gifCache.search('alpha')).toEqual([]);
    expect(await fs.readdir(path.join(dir, 'files'))).not.toContain('1.gif');
  });

  it('survives a restart, and forgets files that vanished from disk', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', [klipyGif(1), klipyGif(2)]);
    await settle();
    await gifCache.shutdown();

    // Someone pruned the drive between runs.
    await fs.unlink(path.join(dir, 'files', '2.gif'));

    gifCache.reset();
    await gifCache.init(dir);

    expect(gifCache.getStats().known).toBe(2);
    expect(gifCache.getStats().onDisk).toBe(1);
    expect(gifCache.search('cats').map(g => g.id)).toEqual(['1']);
  });

  it('adopts a file whose size the index never recorded', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', [klipyGif(1)]);
    await settle();
    await gifCache.shutdown();

    // Simulate a crash between the download finishing and the index flush.
    const indexPath = path.join(dir, 'index.json');
    const saved = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    saved.gifs['1'].bytes = 0;
    await fs.writeFile(indexPath, JSON.stringify(saved));

    gifCache.reset();
    await gifCache.init(dir);

    expect(gifCache.getStats().onDisk).toBe(1);
    expect(gifCache.getStats().bytes).toBe(1024);
    expect(gifCache.search('cats').map(g => g.id)).toEqual(['1']);
  });

  it('sweeps files no index entry claims, so orphans cannot pile up', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', [klipyGif(1)]);
    await settle();
    await gifCache.shutdown();

    // Leftovers from an older run and an aborted download.
    await fs.writeFile(path.join(dir, 'files', 'stranger.gif'), 'x');
    await fs.writeFile(path.join(dir, 'files', '77.gif.part'), 'x');

    gifCache.reset();
    await gifCache.init(dir);

    expect(await fs.readdir(path.join(dir, 'files'))).toEqual(['1.gif']);
  });

  it('refuses to resolve anything but its own files', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', [klipyGif(1)]);
    await settle();

    expect(gifCache.resolve('1.gif')).toBe(path.join(dir, 'files', '1.gif'));
    expect(gifCache.resolve('../../../etc/passwd')).toBeNull();
    expect(gifCache.resolve('../index.json')).toBeNull();
    expect(gifCache.resolve('999.gif')).toBeNull();
    expect(gifCache.resolve('1.gif/../../index.json')).toBeNull();
  });

  it('gives up quietly when the directory cannot be used', async () => {
    const notADir = path.join(dir, 'a-file');
    await fs.writeFile(notADir, 'not a directory');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await gifCache.init(notADir)).toBe(false);
    expect(gifCache.isEnabled()).toBe(false);
    errors.mockRestore();
  });

  it('caps the download backlog so a busy round cannot balloon it', async () => {
    await gifCache.init(dir);
    // Never let a download finish, so everything stays queued.
    global.fetch.mockImplementation(() => new Promise(() => {}));

    gifCache.remember('lots', Array.from({ length: 2500 }, (_, i) => klipyGif(i)));

    const stats = gifCache.getStats();
    expect(stats.known).toBe(2500);          // metadata is cheap, keep it all
    expect(stats.pending).toBeLessThanOrEqual(2002); // queue + the 2 in flight
  });

  it('shuffles a random selection out of the pool', async () => {
    await gifCache.init(dir);
    gifCache.remember('cats', Array.from({ length: 20 }, (_, i) => klipyGif(i)));
    await settle();

    expect(gifCache.random(5)).toHaveLength(5);
    expect(gifCache.random(100)).toHaveLength(20);
  });
});
