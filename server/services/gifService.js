// GIF Service - Tenor + Giphy with fallback
// Free tiers: Tenor (50 calls/day), Giphy (500 calls/day)

import dotenv from 'dotenv';
import { getCacheHealth } from '../../scripts/cache-utils.js';
dotenv.config();

const TENOR_API_KEY = process.env.TENOR_API_KEY || 'YOUR_TENOR_API_KEY';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || 'YOUR_GIPHY_API_KEY';

const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

// Cache for trending GIFs
let trendingCache = [];
let trendingCacheTime = 0;
const CACHE_DURATION = 3600000; // 1 hour

// Rate limiting tracking
let tenorCallsToday = 0;
let giphyCallsToday = 0;
let lastResetDate = new Date().toDateString();

function resetCountersIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    tenorCallsToday = 0;
    giphyCallsToday = 0;
    lastResetDate = today;
  }
}

async function searchTenor(query, limit = 20) {
  resetCountersIfNeeded();

  if (tenorCallsToday >= 50) {
    throw new Error('Tenor daily limit reached');
  }

  const url = new URL(`${TENOR_BASE_URL}/search`);
  url.searchParams.set('key', TENOR_API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('media_filter', 'tinygif,gif');
  url.searchParams.set('contentfilter', 'low');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Tenor API error: ${response.status}`);
  }

  tenorCallsToday++;
  const data = await response.json();

  return data.results.map(gif => ({
    id: gif.id,
    url: gif.media_formats.gif?.url || gif.media_formats.tinygif?.url,
    preview: gif.media_formats.tinygif?.url,
    title: gif.title || query,
    source: 'tenor',
  }));
}

async function searchGiphy(query, limit = 20) {
  resetCountersIfNeeded();

  if (giphyCallsToday >= 500) {
    throw new Error('Giphy daily limit reached');
  }

  const url = new URL(`${GIPHY_BASE_URL}/search`);
  url.searchParams.set('api_key', GIPHY_API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('rating', 'pg-13');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Giphy API error: ${response.status}`);
  }

  giphyCallsToday++;
  const data = await response.json();

  return data.data.map(gif => ({
    id: gif.id,
    url: gif.images.original?.url || gif.images.downsized?.url,
    preview: gif.images.preview_gif?.url || gif.images.downsized?.url,
    title: gif.title || query,
    source: 'giphy',
  }));
}

async function getTrendingTenor(limit = 20) {
  resetCountersIfNeeded();

  if (tenorCallsToday >= 50) {
    throw new Error('Tenor daily limit reached');
  }

  const url = new URL(`${TENOR_BASE_URL}/featured`);
  url.searchParams.set('key', TENOR_API_KEY);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('media_filter', 'tinygif,gif');
  url.searchParams.set('contentfilter', 'low');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Tenor API error: ${response.status}`);
  }

  tenorCallsToday++;
  const data = await response.json();

  return data.results.map(gif => ({
    id: gif.id,
    url: gif.media_formats.gif?.url || gif.media_formats.tinygif?.url,
    preview: gif.media_formats.tinygif?.url,
    title: gif.title || 'Trending',
    source: 'tenor',
  }));
}

async function getTrendingGiphy(limit = 20) {
  resetCountersIfNeeded();

  if (giphyCallsToday >= 500) {
    throw new Error('Giphy daily limit reached');
  }

  const url = new URL(`${GIPHY_BASE_URL}/trending`);
  url.searchParams.set('api_key', GIPHY_API_KEY);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('rating', 'pg-13');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Giphy API error: ${response.status}`);
  }

  giphyCallsToday++;
  const data = await response.json();

  return data.data.map(gif => ({
    id: gif.id,
    url: gif.images.original?.url || gif.images.downsized?.url,
    preview: gif.images.preview_gif?.url || gif.images.downsized?.url,
    title: gif.title || 'Trending',
    source: 'giphy',
  }));
}

export const gifService = {
  async search(query, limit = 20) {
    // Try Tenor first, fall back to Giphy
    try {
      console.log(`🔍 Searching Tenor for: ${query}`);
      return await searchTenor(query, limit);
    } catch (tenorError) {
      console.log(`⚠️ Tenor failed: ${tenorError.message}, trying Giphy...`);
      try {
        return await searchGiphy(query, limit);
      } catch (giphyError) {
        console.error(`❌ Both APIs failed: ${giphyError.message}`);
        throw new Error('Both GIF services are unavailable. Please try again later.');
      }
    }
  },

  async getTrending(limit = 20) {
    // Use cache if available and fresh
    const now = Date.now();
    if (trendingCache.length > 0 && now - trendingCacheTime < CACHE_DURATION) {
      return trendingCache.slice(0, limit);
    }

    // Try Tenor first, fall back to Giphy
    try {
      console.log('🔥 Fetching trending from Tenor');
      const gifs = await getTrendingTenor(limit);
      trendingCache = gifs;
      trendingCacheTime = now;
      return gifs;
    } catch (tenorError) {
      console.log(`⚠️ Tenor trending failed: ${tenorError.message}, trying Giphy...`);
      try {
        const gifs = await getTrendingGiphy(limit);
        trendingCache = gifs;
        trendingCacheTime = now;
        return gifs;
      } catch (giphyError) {
        console.error(`❌ Both APIs failed: ${giphyError.message}`);
        // Return cached data if available, even if stale
        if (trendingCache.length > 0) {
          return trendingCache.slice(0, limit);
        }
        throw new Error('GIF services unavailable');
      }
    }
  },

  getUsageStats() {
    resetCountersIfNeeded();
    return {
      tenor: { used: tenorCallsToday, limit: 50 },
      giphy: { used: giphyCallsToday, limit: 500 },
    };
  },

  getCacheHealth() {
    return getCacheHealth();
  },
};

export default gifService;
