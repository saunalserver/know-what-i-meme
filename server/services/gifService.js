// GIF Service - Cache-first with API fallback
// Free tier: Giphy (500 calls/day)
// Local cache: /mnt/photos/gif-cache/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import cache utilities
import {
  initializeCache,
  searchCache
  getRandomCached
  getAllCached
  getCacheHealth
  gifExists
} from '../../scripts/cache-utils.js';

// Initialize cache on load
initializeCache();

const GIPHY_API_KEY = process.env.GIPHY_API_KEY || 'YOUR_GIPHY_API_KEY';
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

// Cache for trending GIFs (shorter duration for variety)
let trendingCache = [];
let trendingCacheTime = 0;
const CACHE_DURATION = 300000; // 5 minutes

// Rate limiting tracking
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
