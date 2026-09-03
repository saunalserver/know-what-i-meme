// GIF Service - Klipy API
// Live API calls with a short in-memory result cache.

import dotenv from 'dotenv';
dotenv.config();

const KLIPY_BASE_URL = 'https://api.klipy.com/api/v1';

// Klipy allows ~100 calls/min. During a round every player searches at once,
// often for the same obvious word, so a short shared cache both cuts calls and
// makes repeat searches feel instant.
const SEARCH_CACHE_TTL = 5 * 60 * 1000;
const SEARCH_CACHE_MAX = 200;
const TRENDING_CACHE_TTL = 60 * 60 * 1000;
const REQUEST_TIMEOUT = 8000;

const CATEGORIES = [
  { id: 'reactions', name: 'Reactions', emoji: '😏' },
  { id: 'memes', name: 'Memes', emoji: '😂' },
  { id: 'animals', name: 'Animals', emoji: '🐱' },
  { id: 'sports', name: 'Sports', emoji: '⚽' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮' },
  { id: 'celebrity', name: 'Celebrity', emoji: '⭐' },
];

// Map keeps insertion order, which gives us LRU eviction for free.
const searchCache = new Map();
let trendingCache = [];
let trendingCacheTime = 0;

const stats = { apiCalls: 0, cacheHits: 0, errors: 0, startedAt: Date.now() };

function getApiKey() {
  return process.env.KLIPY_API_KEY;
}

function cacheGet(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > SEARCH_CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  // Refresh recency.
  searchCache.delete(key);
  searchCache.set(key, entry);
  stats.cacheHits++;
  return entry.gifs;
}

function cacheSet(key, gifs) {
  searchCache.set(key, { gifs, time: Date.now() });
  while (searchCache.size > SEARCH_CACHE_MAX) {
    searchCache.delete(searchCache.keys().next().value);
  }
}

// Klipy puts the API key in the path, not a header or query param.
function buildKlipyUrl(endpoint) {
  return `${KLIPY_BASE_URL}/${getApiKey()}${endpoint}`;
}

// Klipy structure: file.hd.gif.url, file.md.gif.url, etc.
function transformGif(gif, defaultTitle = 'GIF') {
  const file = gif.file || {};
  const hd = file.hd || {};
  const md = file.md || {};

  return {
    id: gif.id,
    url: hd.gif?.url || md.gif?.url || gif.url,
    preview: md.gif?.url || hd.gif?.url || gif.url,
    title: gif.title || gif.slug || defaultTitle,
    source: 'klipy',
  };
}

async function klipyFetch(endpoint, params, defaultTitle) {
  if (!getApiKey()) {
    throw new Error('KLIPY_API_KEY not configured');
  }

  const url = `${buildKlipyUrl(endpoint)}?${new URLSearchParams(params)}`;
  stats.apiCalls++;

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
  } catch (error) {
    stats.errors++;
    // A timeout or DNS failure should read the same as any other upstream fault.
    throw new Error(`Klipy API error: ${error.name === 'TimeoutError' ? 'timeout' : error.message}`);
  }

  if (!response.ok) {
    stats.errors++;
    throw new Error(`Klipy API error: ${response.status}`);
  }

  // Klipy response: { result: true, data: { data: [...] } }
  const json = await response.json();
  const gifs = json.data?.data || [];
  return gifs.map(gif => transformGif(gif, defaultTitle));
}

export const gifService = {
  // Search GIFs, dropping any the caller has already been shown.
  async search(query, limit = 20, excludeIds = []) {
    const normalized = query.trim().toLowerCase();
    // Fetch a bigger page than asked for so exclusions still leave a full grid.
    const fetchCount = Math.min(limit + excludeIds.length, 50);
    const cacheKey = `search:${normalized}:${fetchCount}`;

    let results = cacheGet(cacheKey);
    if (!results) {
      results = await klipyFetch('/gifs/search', { q: normalized, per_page: fetchCount }, query);
      cacheSet(cacheKey, results);
    }

    const excluded = new Set(excludeIds);
    return results.filter(gif => !excluded.has(String(gif.id))).slice(0, limit);
  },

  async getTrending(limit = 20, fresh = false) {
    const now = Date.now();

    if (!fresh && trendingCache.length > 0 && now - trendingCacheTime < TRENDING_CACHE_TTL) {
      stats.cacheHits++;
      return trendingCache.slice(0, limit);
    }

    try {
      // Always pull a deep page so shuffle and repeat requests have material.
      const gifs = await klipyFetch('/gifs/trending', { per_page: 50 }, 'Trending');
      if (gifs.length > 0) {
        trendingCache = gifs;
        trendingCacheTime = now;
      }
      return gifs.slice(0, limit);
    } catch (error) {
      console.error(`❌ Klipy trending failed: ${error.message}`);
      // Stale trending beats an empty grid mid-round.
      if (trendingCache.length > 0) return trendingCache.slice(0, limit);
      throw new Error('GIF service unavailable');
    }
  },

  // Random = a shuffled slice of the (cached) trending pool, so it costs nothing.
  async getRandom(limit = 20) {
    const gifs = [...(await this.getTrending(50))];
    for (let i = gifs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gifs[i], gifs[j]] = [gifs[j], gifs[i]];
    }
    return gifs.slice(0, limit);
  },

  getByCategory(categoryId, limit = 20) {
    return this.search(categoryId, limit);
  },

  getCategories() {
    return CATEGORIES;
  },

  getEmojiMap() {
    return Object.fromEntries(CATEGORIES.map(cat => [cat.emoji, cat.id]));
  },

  getUsageStats() {
    const total = stats.apiCalls + stats.cacheHits;
    return {
      apiCalls: stats.apiCalls,
      cacheHits: stats.cacheHits,
      errors: stats.errors,
      hitRate: total ? `${Math.round((stats.cacheHits / total) * 100)}%` : 'n/a',
      cachedQueries: searchCache.size,
      trendingCachedAt: trendingCacheTime ? new Date(trendingCacheTime).toISOString() : null,
      uptimeMinutes: Math.round((Date.now() - stats.startedAt) / 60000),
    };
  },

  // Test seam: drop every cached result and counter.
  resetCache() {
    searchCache.clear();
    trendingCache = [];
    trendingCacheTime = 0;
    stats.apiCalls = 0;
    stats.cacheHits = 0;
    stats.errors = 0;
  },
};

export default gifService;
