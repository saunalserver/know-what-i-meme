// GIF Service - Klipy API
// Live API calls, no local caching

import dotenv from 'dotenv';
dotenv.config();

const KLIPY_API_KEY = process.env.KLIPY_API_KEY;
const KLIPY_BASE_URL = 'https://api.klipy.com/api/v1';

// In-memory cache for trending (1 hour TTL)
let trendingCache = [];
let trendingCacheTime = 0;
const CACHE_DURATION = 3600000; // 1 hour

// Static categories with emojis
const CATEGORIES = [
  { id: 'reactions', name: 'Reactions', emoji: '😏' },
  { id: 'memes', name: 'Memes', emoji: '😂' },
  { id: 'animals', name: 'Animals', emoji: '🐱' },
  { id: 'sports', name: 'Sports', emoji: '⚽' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮' },
  { id: 'celebrity', name: 'Celebrity', emoji: '⭐' },
];

// Build Klipy URL with API key in path
function buildKlipyUrl(endpoint) {
  return `${KLIPY_BASE_URL}/${KLIPY_API_KEY}${endpoint}`;
}

// Transform Klipy response to our format
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

// Search Klipy GIFs
async function searchKlipy(query, limit = 20) {
  if (!KLIPY_API_KEY) {
    throw new Error('KLIPY_API_KEY not configured');
  }

  const url = `${buildKlipyUrl('/gifs/search')}?q=${encodeURIComponent(query)}&per_page=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Klipy API error: ${response.status}`);
  }

  const json = await response.json();
  // Klipy response: { result: true, data: { data: [...] } }
  const gifs = json.data?.data || [];
  return gifs.map(gif => transformGif(gif, query));
}

// Get trending from Klipy
async function getTrendingKlipy(limit = 20) {
  if (!KLIPY_API_KEY) {
    throw new Error('KLIPY_API_KEY not configured');
  }

  const url = `${buildKlipyUrl('/gifs/trending')}?per_page=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Klipy API error: ${response.status}`);
  }

  const json = await response.json();
  // Klipy response: { result: true, data: { data: [...] } }
  const gifs = json.data?.data || [];
  return gifs.map(gif => transformGif(gif, 'Trending'));
}

export const gifService = {
  // Search GIFs with optional exclusion filter
  async search(query, limit = 20, excludeIds = []) {
    console.log(`🔍 Searching Klipy for: ${query}`);
    const results = await searchKlipy(query, limit + excludeIds.length);

    // Filter out excluded IDs
    const filtered = results.filter(gif => !excludeIds.includes(gif.id));
    return filtered.slice(0, limit);
  },

  // Get trending with cache and fresh parameter support
  async getTrending(limit = 20, fresh = false) {
    const now = Date.now();

    // Return cached if available and not requesting fresh
    if (!fresh && trendingCache.length > 0 && now - trendingCacheTime < CACHE_DURATION) {
      console.log('📦 Returning cached trending');
      return trendingCache.slice(0, limit);
    }

    try {
      console.log('🔥 Fetching trending from Klipy');
      const gifs = await getTrendingKlipy(limit);
      trendingCache = gifs;
      trendingCacheTime = now;
      return gifs;
    } catch (error) {
      console.error(`❌ Klipy trending failed: ${error.message}`);

      // Return stale cache on error
      if (trendingCache.length > 0) {
        console.log('📦 Returning stale cache due to error');
        return trendingCache.slice(0, limit);
      }

      throw new Error('GIF service unavailable');
    }
  },

  // Get random GIFs (trending + shuffle)
  async getRandom(limit = 20) {
    console.log('🎲 Getting random GIFs');
    const gifs = await this.getTrending(50);
    const shuffled = gifs.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit);
  },

  // Get GIFs by category
  async getByCategory(categoryId, limit = 20) {
    console.log(`📁 Getting GIFs for category: ${categoryId}`);
    return this.search(categoryId, limit);
  },

  // Get available categories
  getCategories() {
    return CATEGORIES;
  },

  // Get emoji to category mapping
  getEmojiMap() {
    const map = {};
    CATEGORIES.forEach(cat => {
      if (cat.emoji) {
        map[cat.emoji] = cat.id;
      }
    });
    return map;
  },

  // Get usage stats (placeholder - Klipy doesn't track this the same way)
  getUsageStats() {
    return {
      klipy: { used: 'N/A', limit: 'generous' },
      note: 'Using live Klipy API - no daily limit tracking',
    };
  },

  // Get cache health (now just reports live API status)
  getCacheHealth() {
    return {
      status: 'live-api',
      cachedGifs: 0,
      trendingCacheSize: trendingCache.length,
      trendingCacheAge: trendingCacheTime ? Math.round((Date.now() - trendingCacheTime) / 1000 / 60) : 0,
      message: 'Using Klipy live API - no local cache',
    };
  },
};

export default gifService;
