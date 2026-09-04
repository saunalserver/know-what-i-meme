// Local GIF pool - an opt-in, on-disk copy of GIFs the game has already shown,
// so a LAN party can keep playing when Klipy is unreachable.
//
// Entirely inert unless GIF_CACHE_DIR is set, which is the case for anyone who
// clones the repo: no directory, no downloads, no fallback, no cost.
//
// Every result of a successful Klipy search is remembered, not just the GIFs
// players pick, so the pool grows toward the things this group actually
// searches for. Metadata is recorded immediately (it is already in the
// response); the files themselves download in the background, a couple at a
// time, so a round is never waiting on them.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const DEFAULT_MAX_BYTES = 5e9; // 5 GB, decimal like df(1)
const MAX_FILE_BYTES = 8e6;                     // skip the multi-megabyte monsters
const MAX_CONCURRENT_DOWNLOADS = 2;
// Each search yields 100 results, so a busy round can queue thousands. Cap the
// backlog and keep the newest: an old queue entry is a GIF nobody is looking
// at any more.
const MAX_QUEUE = 2000;
const DOWNLOAD_TIMEOUT = 20_000;
const INDEX_FLUSH_MS = 5_000;
const INDEX_VERSION = 1;

// Words that match everything and so rank nothing.
const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'is', 'it', 'gif']);

const state = {
  dir: null,
  filesDir: null,
  indexPath: null,
  maxBytes: DEFAULT_MAX_BYTES,
  gifs: new Map(),   // id -> entry
  bytes: 0,
  queue: [],
  queued: new Set(),
  active: 0,
  flushTimer: null,
  dirty: false,
  loaded: false,
  downloads: 0,
  failures: 0,
  evictions: 0,
};

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

// One flat, predictable filename per GIF so the HTTP route can validate it.
function fileNameFor(id) {
  return `${String(id).replace(/[^A-Za-z0-9_-]/g, '')}.gif`;
}

function scheduleFlush() {
  state.dirty = true;
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    flush().catch(error => console.error(`❌ GIF cache index write failed: ${error.message}`));
  }, INDEX_FLUSH_MS);
  state.flushTimer.unref?.();
}

async function flush() {
  if (!state.dir || !state.dirty) return;
  state.dirty = false;
  const payload = {
    version: INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    gifs: Object.fromEntries(state.gifs),
  };
  const tmp = `${state.indexPath}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(payload));
  await fsp.rename(tmp, state.indexPath); // atomic: a crash never truncates the index
}

// Drop the least recently seen GIFs until the pool is back under its cap.
async function evictToFit() {
  if (state.bytes <= state.maxBytes) return;

  const byAge = [...state.gifs.values()]
    .filter(entry => entry.bytes > 0)
    .sort((a, b) => (a.lastSeenAt || 0) - (b.lastSeenAt || 0));

  for (const entry of byAge) {
    if (state.bytes <= state.maxBytes) break;
    try {
      await fsp.unlink(path.join(state.filesDir, entry.file));
    } catch {
      // Already gone; the accounting below still needs to happen.
    }
    state.bytes -= entry.bytes;
    state.gifs.delete(entry.id);
    state.evictions++;
  }
  scheduleFlush();
}

async function downloadOne(entry) {
  const target = path.join(state.filesDir, entry.file);

  const response = await fetch(entry.sourceUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_FILE_BYTES) throw new Error(`too large (${declared} bytes)`);

  const tmp = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmp));

  const { size } = await fsp.stat(tmp);
  if (size > MAX_FILE_BYTES || size === 0) {
    await fsp.unlink(tmp).catch(() => {});
    throw new Error(`unusable size (${size} bytes)`);
  }

  await fsp.rename(tmp, target);
  entry.bytes = size;
  state.bytes += size;
  state.downloads++;
  scheduleFlush();
  await evictToFit();
}

function pump() {
  while (state.active < MAX_CONCURRENT_DOWNLOADS && state.queue.length > 0) {
    const entry = state.queue.shift();
    state.queued.delete(entry.id);
    state.active++;
    downloadOne(entry)
      .catch(error => {
        state.failures++;
        // A GIF we could not fetch is simply not in the pool; the entry stays
        // so its metadata still answers searches once Klipy is back.
        if (process.env.GIF_CACHE_VERBOSE) {
          console.warn(`⚠️  GIF cache skipped ${entry.id}: ${error.message}`);
        }
      })
      .finally(() => {
        state.active--;
        pump();
      });
  }
}

function enqueue(entry) {
  if (entry.bytes > 0 || state.queued.has(entry.id)) return;
  // A full pool still takes new GIFs; evictToFit drops the least recently seen
  // ones afterwards. Refusing new downloads instead would freeze the pool on
  // whatever it happened to see first and never refresh it.
  state.queued.add(entry.id);
  state.queue.push(entry);
  while (state.queue.length > MAX_QUEUE) {
    state.queued.delete(state.queue.shift().id);
  }
  pump();
}

export const gifCache = {
  // Called once at boot. Returns false when the pool is switched off, which is
  // the default.
  async init(dir = process.env.GIF_CACHE_DIR, maxGb = process.env.GIF_CACHE_MAX_GB) {
    this.reset();
    if (!dir) return false;

    const parsed = Number(maxGb);
    state.maxBytes = Number.isFinite(parsed) && parsed > 0 ? parsed * 1e9 : DEFAULT_MAX_BYTES;

    state.dir = path.resolve(dir);
    state.filesDir = path.join(state.dir, 'files');
    state.indexPath = path.join(state.dir, 'index.json');

    try {
      await fsp.mkdir(state.filesDir, { recursive: true });
    } catch (error) {
      // A missing USB drive must not take the game down with it.
      console.error(`❌ GIF cache disabled, cannot use ${state.dir}: ${error.message}`);
      this.reset();
      return false;
    }

    await this.load();
    console.log(
      `💾 GIF pool: ${state.gifs.size} known, ${(state.bytes / 1e9).toFixed(2)} GB on disk ` +
      `(cap ${(state.maxBytes / 1e9).toFixed(0)} GB) at ${state.dir}`
    );
    return true;
  },

  // Rebuild the in-memory index, trusting the disk over the index file: a file
  // that vanished (drive swap, manual prune) must not be offered offline, and
  // a file whose size the index never recorded is still perfectly usable.
  // Anything on disk that no entry claims is deleted -- that is exactly how the
  // old prefetch cache grew 22 GB of files nothing could ever find again.
  async load() {
    state.gifs.clear();
    state.bytes = 0;

    let saved = {};
    try {
      const raw = await fsp.readFile(state.indexPath, 'utf8');
      saved = JSON.parse(raw).gifs || {};
    } catch {
      saved = {}; // No index yet, or an unreadable one: start clean.
    }

    let present = new Set();
    try {
      present = new Set(await fsp.readdir(state.filesDir));
    } catch {
      return; // Directory disappeared between mkdir and now.
    }

    const claimed = new Set();
    for (const [id, entry] of Object.entries(saved)) {
      if (!entry || !entry.file) continue;

      if (!present.has(entry.file)) {
        // Keep the metadata so searches still match once it is fetched again.
        state.gifs.set(id, { ...entry, id, bytes: 0 });
        continue;
      }

      claimed.add(entry.file);
      let bytes = entry.bytes || 0;
      if (bytes <= 0) {
        // The index was written before this download finished. The file is
        // real; adopt its actual size rather than throwing it away.
        try {
          bytes = (await fsp.stat(path.join(state.filesDir, entry.file))).size;
        } catch {
          bytes = 0;
        }
      }
      state.bytes += bytes;
      state.gifs.set(id, { ...entry, id, bytes });
    }

    for (const file of present) {
      if (claimed.has(file)) continue;
      // Unclaimed leftovers and half-finished downloads.
      await fsp.unlink(path.join(state.filesDir, file)).catch(() => {});
      state.evictions++;
    }

    state.loaded = true;
    scheduleFlush();
  },

  isEnabled() {
    return state.dir !== null;
  },

  // Record every GIF a Klipy result returned and queue the ones we do not have.
  remember(query, gifs) {
    if (!state.dir || !Array.isArray(gifs)) return;

    const now = Date.now();
    for (const gif of gifs) {
      if (!gif || gif.id === undefined || gif.id === null) continue;
      const id = String(gif.id);
      const source = gif.preview || gif.url;
      if (!source || !/^https?:\/\//i.test(source)) continue;

      const existing = state.gifs.get(id);
      if (existing) {
        existing.lastSeenAt = now;
        // Keep the query that found it, so later searches for it still match.
        if (query && !existing.queries.includes(query)) existing.queries.push(query);
        enqueue(existing);
        continue;
      }

      const entry = {
        id,
        title: gif.title || '',
        queries: query ? [query] : [],
        file: fileNameFor(id),
        sourceUrl: source,
        bytes: 0,
        addedAt: now,
        lastSeenAt: now,
      };
      state.gifs.set(id, entry);
      enqueue(entry);
    }
    scheduleFlush();
  },

  // Offline search: rank what is on disk by how much of the query it matches.
  search(query, limit = 20, excludeIds = []) {
    if (!state.dir) return [];

    const wanted = tokenize(query);
    const excluded = new Set((excludeIds || []).map(String));
    const scored = [];

    for (const entry of state.gifs.values()) {
      if (entry.bytes <= 0 || excluded.has(entry.id)) continue;

      const haystack = tokenize(`${entry.title} ${entry.queries.join(' ')}`);
      if (wanted.length === 0) {
        scored.push({ entry, score: 0 });
        continue;
      }

      let score = 0;
      for (const word of wanted) {
        if (entry.queries.some(q => q.toLowerCase() === query.trim().toLowerCase())) score += 3;
        if (haystack.includes(word)) score += 2;
        else if (haystack.some(token => token.startsWith(word))) score += 1;
      }
      if (score > 0) scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score || b.entry.lastSeenAt - a.entry.lastSeenAt);
    return scored.slice(0, limit).map(({ entry }) => toGif(entry));
  },

  // Anything at all, shuffled -- the offline stand-in for trending.
  random(limit = 20) {
    if (!state.dir) return [];
    const pool = [...state.gifs.values()].filter(entry => entry.bytes > 0);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, limit).map(toGif);
  },

  // Resolve a filename from the HTTP route back to a path on disk, refusing
  // anything that is not a file this pool actually owns.
  resolve(fileName) {
    if (!state.dir || !/^[A-Za-z0-9_-]+\.gif$/.test(fileName)) return null;
    for (const entry of state.gifs.values()) {
      if (entry.file === fileName && entry.bytes > 0) {
        return path.join(state.filesDir, fileName);
      }
    }
    return null;
  },

  getStats() {
    return {
      enabled: state.dir !== null,
      dir: state.dir,
      known: state.gifs.size,
      onDisk: [...state.gifs.values()].filter(e => e.bytes > 0).length,
      bytes: state.bytes,
      gb: Number((state.bytes / 1e9).toFixed(2)),
      capGb: Number((state.maxBytes / 1e9).toFixed(0)),
      pending: state.queue.length + state.active,
      downloads: state.downloads,
      failures: state.failures,
      evictions: state.evictions,
    };
  },

  async shutdown() {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    if (state.dir) await flush().catch(() => {});
  },

  // Test seam: forget everything without touching the disk.
  reset() {
    if (state.flushTimer) clearTimeout(state.flushTimer);
    Object.assign(state, {
      dir: null, filesDir: null, indexPath: null, maxBytes: DEFAULT_MAX_BYTES,
      gifs: new Map(), bytes: 0, queue: [], queued: new Set(), active: 0,
      flushTimer: null, dirty: false, loaded: false,
      downloads: 0, failures: 0, evictions: 0,
    });
  },
};

// The HTTP layer turns "local:" into a URL under whichever prefix it is mounted.
function toGif(entry) {
  return {
    id: entry.id,
    url: `local:${entry.file}`,
    preview: `local:${entry.file}`,
    title: entry.title || 'GIF',
    source: 'local',
  };
}

export default gifCache;
