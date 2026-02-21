// GIF Service - Tenor + Giphy with fallback
// Free tiers: Tenor (50 calls/day), Giphy (500 calls/day)

import dotenv from 'dotenv';
dotenv.config();

const TENOR_API_KEY = process.env.TENOR_API_KEY || 'YOUR_TENOR_API_KEY';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || 'YOUR_GIPHY_API_KEY';

const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

// Cache for trending GIFs (shorter duration for variety)
let trendingCache = [];
let trendingCacheTime = 0;
const CACHE_DURATION = 300000; // 5 minutes (was 1 hour)

// Rate limiting tracking
let tenorCallsToday = 0;
let giphyCallsToday = 0;
let lastResetDate = new Date().toDateString();

// Emoji to search term mapping
const EMOJI_MAP = {
  '😂': 'laughing funny',
  '😭': 'crying sad',
  '😍': 'love heart eyes',
  '🤣': 'laughing rolling',
  '😊': 'happy smile',
  '😎': 'cool sunglasses',
  '🤔': 'thinking hmm',
  '😱': 'scared shocked',
  '👍': 'thumbs up approval',
  '👎': 'thumbs down disapproval',
  '🔥': 'fire hot lit',
  '💀': 'skull dead dying',
  '👀': 'eyes watching looking',
  '🎉': 'celebration party',
  '😢': 'sad crying',
  '😡': 'angry mad',
  '🤷': 'shrug whatever',
  '🙌': 'praise hands celebration',
  '😏': 'smirk cheeky',
  '😴': 'sleepy tired bored',
};

// Categories for quick browsing
const CATEGORIES = [
  { id: 'reactions', name: 'Reactions', emoji: '😅', query: 'reaction face' },
  { id: 'animals', name: 'Animals', emoji: '🐱', query: 'funny animals' },
  { id: 'memes', name: 'Memes', emoji: '🗿', query: 'meme viral' },
  { id: 'celebrate', name: 'Celebrate', emoji: '🎉', query: 'celebration party' },
  { id: 'fail', name: 'Fails', emoji: '🤦', query: 'fail oops' },
  { id: 'love', name: 'Love', emoji: '💕', query: 'love heart romantic' },
];

function resetCountersIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    tenorCallsToday = 0;
    giphyCallsToday = 0;
    lastResetDate = today;
  }
}

// Generate a random position for variety
function getRandomPosition(max = 50) {
  return Math.floor(Math.random() * max);
}

async function searchTenor(query, limit = 20, pos = 0) {
  resetCountersIfNeeded();

  if (tenorCallsToday >= 50) {
    throw new Error('Tenor daily limit reached');
  }

  const url = new URL(`${TENOR_BASE_URL}/search`);
  url.searchParams.set('key', TENOR_API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('pos', pos.toString());
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

async function searchGiphy(query, limit = 20, offset = 0) {
  resetCountersIfNeeded();

  if (giphyCallsToday >= 500) {
    throw new Error('Giphy daily limit reached');
  }

  const url = new URL(`${GIPHY_BASE_URL}/search`);
  url.searchParams.set('api_key', GIPHY_API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('offset', offset.toString());
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

async function getTrendingTenor(limit = 20, pos = 0) {
  resetCountersIfNeeded();

  if (tenorCallsToday >= 50) {
    throw new Error('Tenor daily limit reached');
  }

  const url = new URL(`${TENOR_BASE_URL}/featured`);
  url.searchParams.set('key', TENOR_API_KEY);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('pos', pos.toString());
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

async function getTrendingGiphy(limit = 20, offset = 0) {
  resetCountersIfNeeded();

  if (giphyCallsToday >= 500) {
    throw new Error('Giphy daily limit reached');
  }

  const url = new URL(`${GIPHY_BASE_URL}/trending`);
  url.searchParams.set('api_key', GIPHY_API_KEY);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('offset', offset.toString());
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

// Get random GIFs for variety
async function getRandomGifs(limit = 20) {
  resetCountersIfNeeded();

  // Try Tenor random endpoint first
  if (tenorCallsToday < 50) {
    try {
      const url = new URL(`${TENOR_BASE_URL}/search`);
      url.searchParams.set('key', TENOR_API_KEY);
      url.searchParams.set('q', 'funny meme reaction');
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('pos', getRandomPosition(100).toString());
      url.searchParams.set('media_filter', 'tinygif,gif');
      url.searchParams.set('contentfilter', 'low');

      const response = await fetch(url.toString());
      if (response.ok) {
        tenorCallsToday++;
        const data = await response.json();
        return data.results.map(gif => ({
          id: gif.id,
          url: gif.media_formats.gif?.url || gif.media_formats.tinygif?.url,
          preview: gif.media_formats.tinygif?.url,
          title: gif.title || 'Random',
          source: 'tenor',
        }));
      }
    } catch (e) {}
  }

  // Fallback to Giphy random
  if (giphyCallsToday < 500) {
    try {
      const url = new URL(`${GIPHY_BASE_URL}/search`);
      url.searchParams.set('api_key', GIPHY_API_KEY);
      url.searchParams.set('q', 'funny');
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', getRandomPosition(200).toString());
      url.searchParams.set('rating', 'pg-13');

      const response = await fetch(url.toString());
      if (response.ok) {
        giphyCallsToday++;
        const data = await response.json();
        return data.data.map(gif => ({
          id: gif.id,
          url: gif.images.original?.url || gif.images.downsized?.url,
          preview: gif.images.preview_gif?.url || gif.images.downsized?.url,
          title: gif.title || 'Random',
          source: 'giphy',
        }));
      }
    } catch (e) {}
  }

  return [];
}

export const gifService = {
  async search(query, limit = 20, excludeIds = []) {
    // Check for emoji in query and convert
    let searchQuery = query;
    for (const [emoji, term] of Object.entries(EMOJI_MAP)) {
      if (query.includes(emoji)) {
        searchQuery = query.replace(emoji, term);
      }
    }

    // Add random offset for variety
    const randomOffset = getRandomPosition(30);

    // Try Tenor first, fall back to Giphy
    try {
      console.log(`🔍 Searching Tenor for: ${searchQuery}`);
      let results = await searchTenor(searchQuery, limit, randomOffset);
      // Filter out excluded IDs (seen GIFs)
      if (excludeIds.length > 0) {
        results = results.filter(gif => !excludeIds.includes(gif.id));
      }
      return results;
    } catch (tenorError) {
      console.log(`⚠️ Tenor failed: ${tenorError.message}, trying Giphy...`);
      try {
        let results = await searchGiphy(searchQuery, limit, randomOffset);
        if (excludeIds.length > 0) {
          results = results.filter(gif => !excludeIds.includes(gif.id));
        }
        return results;
      } catch (giphyError) {
        console.error(`❌ Both APIs failed: ${giphyError.message}`);
        throw new Error('Both GIF services are unavailable. Please try again later.');
      }
    }
  },

  async getTrending(limit = 20, forceFresh = false) {
    const now = Date.now();

    // Use cache if available and fresh (unless force fresh)
    if (!forceFresh && trendingCache.length > 0 && now - trendingCacheTime < CACHE_DURATION) {
      // Return a shuffled subset for variety
      const shuffled = [...trendingCache].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, limit);
    }

    // Random position for variety
    const randomPos = getRandomPosition(50);

    // Try Tenor first, fall back to Giphy
    try {
      console.log(`🔥 Fetching trending from Tenor (pos: ${randomPos})`);
      const gifs = await getTrendingTenor(limit, randomPos);
      trendingCache = gifs;
      trendingCacheTime = now;
      return gifs;
    } catch (tenorError) {
      console.log(`⚠️ Tenor trending failed: ${tenorError.message}, trying Giphy...`);
      try {
        const gifs = await getTrendingGiphy(limit, randomPos);
        trendingCache = gifs;
        trendingCacheTime = now;
        return gifs;
      } catch (giphyError) {
        console.error(`❌ Both APIs failed: ${giphyError.message}`);
        // Return cached data if available, even if stale
        if (trendingCache.length > 0) {
          const shuffled = [...trendingCache].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, limit);
        }
        throw new Error('GIF services unavailable');
      }
    }
  },

  async getRandom(limit = 20) {
    return getRandomGifs(limit);
  },

  async getByCategory(categoryId, limit = 20) {
    const category = CATEGORIES.find(c => c.id === categoryId);
    if (!category) {
      throw new Error('Invalid category');
    }
    return this.search(category.query, limit);
  },

  getCategories() {
    return CATEGORIES;
  },

  getEmojiMap() {
    return EMOJI_MAP;
  },

  // Convert emoji to search term
  emojiToQuery(text) {
    let result = text;
    for (const [emoji, term] of Object.entries(EMOJI_MAP)) {
      if (text.includes(emoji)) {
        result = result.replace(emoji, term);
      }
    }
    return result;
  },

  getUsageStats() {
    resetCountersIfNeeded();
    return {
      tenor: { used: tenorCallsToday, limit: 50 },
      giphy: { used: giphyCallsToday, limit: 500 },
    };
  },
};

export default gifService;
