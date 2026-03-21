#!/usr/bin/env node
/**
 * GIF Prefetcher Script
 * Runs hourly to fetch and cache GIFs from Giphy and Tenor
 *
 * Usage: node scripts/prefetch-gifs.js [--force] [--query="search term"]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import cache utilities
import {
  initializeCache,
  gifExists,
  addGifToIndex,
  parseQueueFile,
  markQueueItemCompleted,
  updateQueueStats,
  generateSafeFilename,
  hasSpaceForMore,
  getCacheHealth,
  loadStats,
  saveStats,
  MAX_GIFS_PER_SEARCH,
  MAX_FILE_SIZE,
  MIN_DIMENSION,
  GIFS_DIR
} from './cache-utils.js';

// API Configuration
const TENOR_API_KEY = process.env.TENOR_API_KEY;
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

// Rate limiting (Giphy beta: 100/hour, Tenor: conservative)
const MAX_GIPHY_CALLS = 100;
const MAX_TENOR_CALLS = 50;

// Track API calls this session
let giphyCalls = 0;
let tenorCalls = 0;

// Parse command line args
const args = process.argv.slice(2);
const forceRun = args.includes('--force');
const forceRedownload = args.includes('--refetch');
const queryArg = args.find(a => a.startsWith('--query='));
const forcedQuery = queryArg ? queryArg.split('=')[1].replace(/"/g, '') : null;

/**
 * Fetch GIFs from Giphy
 */
async function fetchFromGiphy(query, limit = 50) {
  if (giphyCalls >= MAX_GIPHY_CALLS) {
    console.log('Giphy rate limit reached for this session');
    return [];
  }

  if (!GIPHY_API_KEY) {
    console.log('Giphy API key not configured');
    return [];
  }

  try {
    const url = new URL(`${GIPHY_BASE_URL}/search`);
    url.searchParams.set('api_key', GIPHY_API_KEY);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('rating', 'pg-13');
    url.searchParams.set('lang', 'en');

    console.log(`Fetching from Giphy: "${query}"`);
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`Giphy API error: ${response.status}`);
      return [];
    }

    giphyCalls++;
    const data = await response.json();

    return data.data.map(gif => ({
      id: gif.id,
      source: 'giphy',
      title: gif.title || query,
      originalUrl: gif.images.original?.url,
      previewUrl: gif.images.preview_gif?.url || gif.images.downsized?.url,
      width: parseInt(gif.images.original?.width || 0),
      height: parseInt(gif.images.original?.height || 0),
      tags: extractTags(gif),
      fileSize: parseInt(gif.images.original?.size || 0)
    }));
  } catch (error) {
    console.error(`Giphy fetch error: ${error.message}`);
    return [];
  }
}

/**
 * Fetch GIFs from Tenor
 */
async function fetchFromTenor(query, limit = 50) {
  if (tenorCalls >= MAX_TENOR_CALLS) {
    console.log('Tenor rate limit reached for this session');
    return [];
  }

  if (!TENOR_API_KEY) {
    console.log('Tenor API key not configured');
    return [];
  }

  try {
    const url = new URL(`${TENOR_BASE_URL}/search`);
    url.searchParams.set('key', TENOR_API_KEY);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('media_filter', 'gif,tinygif');
    url.searchParams.set('contentfilter', 'low');
    url.searchParams.set('locale', 'en_US');

    console.log(`Fetching from Tenor: "${query}"`);
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`Tenor API error: ${response.status}`);
      return [];
    }

    tenorCalls++;
    const data = await response.json();

    return data.results.map(gif => ({
      id: gif.id,
      source: 'tenor',
      title: gif.title || query,
      originalUrl: gif.media_formats?.gif?.url,
      previewUrl: gif.media_formats?.tinygif?.url,
      width: gif.media_formats?.gif?.dims?.[0] || 0,
      height: gif.media_formats?.gif?.dims?.[1] || 0,
      tags: gif.tags || [],
      fileSize: gif.media_formats?.gif?.size || 0
    }));
  } catch (error) {
    console.error(`Tenor fetch error: ${error.message}`);
    return [];
  }
}

/**
 * Extract tags from Giphy response
 */
function extractTags(gif) {
  const tags = [];

  // Add title words as tags
  if (gif.title) {
    const titleWords = gif.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
    tags.push(...titleWords);
  }

  // Add username if available
  if (gif.username) {
    tags.push(gif.username.toLowerCase());
  }

  // Add source tld if available
  if (gif.source_tld) {
    tags.push(gif.source_tld.toLowerCase());
  }

  return [...new Set(tags)];
}

/**
 * Download a GIF to local storage
 */
async function downloadGif(gif, searchQuery, skipDupeCheck = false) {
  // Validate GIF
  if (!gif.originalUrl) {
    return null;
  }

  // Check dimensions
  if (gif.width < MIN_DIMENSION || gif.height < MIN_DIMENSION) {
    console.log(`Skipping ${gif.id}: too small (${gif.width}x${gif.height})`);
    return null;
  }

  // Check file size (if known)
  if (gif.fileSize > MAX_FILE_SIZE) {
    console.log(`Skipping ${gif.id}: too large (${Math.round(gif.fileSize / 1024)}KB)`);
    return null;
  }

  // Check for duplicates (skip if force redownload)
  if (!skipDupeCheck && gifExists(gif.source, gif.id)) {
    return null;
  }

  // Check storage space
  if (!hasSpaceForMore(gif.fileSize || 500 * 1024)) {
    console.log('Cache storage limit reached');
    return null;
  }

  try {
    // Generate filename
    const filename = generateSafeFilename(gif.source, gif.id, gif.originalUrl);
    const localPath = path.join(GIFS_DIR, filename);

    // Download the GIF
    console.log(`Downloading: ${gif.id}`);
    const response = await fetch(gif.originalUrl);

    if (!response.ok) {
      console.error(`Download failed: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const actualSize = buffer.length;

    // Double-check size after download
    if (actualSize > MAX_FILE_SIZE) {
      console.log(`Skipping ${gif.id}: downloaded file too large (${Math.round(actualSize / 1024)}KB)`);
      return null;
    }

    // Write to disk
    fs.writeFileSync(localPath, buffer);

    // Get actual dimensions if we couldn't get them from API
    const width = gif.width || 200;
    const height = gif.height || 200;

    return {
      id: gif.id,
      source: gif.source,
      title: gif.title,
      localPath: localPath,
      originalUrl: gif.originalUrl,
      previewUrl: gif.previewUrl || gif.originalUrl,
      tags: gif.tags,
      width: width,
      height: height,
      fileSize: actualSize,
      searchQuery: searchQuery
    };
  } catch (error) {
    console.error(`Error downloading ${gif.id}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch trending GIFs (fallback when queue is empty)
 */
async function fetchTrending() {
  console.log('Fetching trending GIFs...');

  const results = [];

  // Fetch trending from Giphy
  if (giphyCalls < MAX_GIPHY_CALLS && GIPHY_API_KEY) {
    try {
      const url = new URL(`${GIPHY_BASE_URL}/trending`);
      url.searchParams.set('api_key', GIPHY_API_KEY);
      url.searchParams.set('limit', '50');
      url.searchParams.set('rating', 'pg-13');

      const response = await fetch(url.toString());
      if (response.ok) {
        giphyCalls++;
        const data = await response.json();

        for (const gif of data.data) {
          results.push({
            id: gif.id,
            source: 'giphy',
            title: gif.title || 'Trending',
            originalUrl: gif.images.original?.url,
            previewUrl: gif.images.preview_gif?.url,
            width: parseInt(gif.images.original?.width || 0),
            height: parseInt(gif.images.original?.height || 0),
            tags: extractTags(gif),
            fileSize: parseInt(gif.images.original?.size || 0)
          });
        }
      }
    } catch (error) {
      console.error(`Giphy trending error: ${error.message}`);
    }
  }

  // Fetch featured from Tenor
  if (tenorCalls < MAX_TENOR_CALLS && TENOR_API_KEY) {
    try {
      const url = new URL(`${TENOR_BASE_URL}/featured`);
      url.searchParams.set('key', TENOR_API_KEY);
      url.searchParams.set('limit', '50');
      url.searchParams.set('media_filter', 'gif,tinygif');
      url.searchParams.set('contentfilter', 'low');

      const response = await fetch(url.toString());
      if (response.ok) {
        tenorCalls++;
        const data = await response.json();

        for (const gif of data.results) {
          results.push({
            id: gif.id,
            source: 'tenor',
            title: gif.title || 'Trending',
            originalUrl: gif.media_formats?.gif?.url,
            previewUrl: gif.media_formats?.tinygif?.url,
            width: gif.media_formats?.gif?.dims?.[0] || 0,
            height: gif.media_formats?.gif?.dims?.[1] || 0,
            tags: gif.tags || [],
            fileSize: gif.media_formats?.gif?.size || 0
          });
        }
      }
    } catch (error) {
      console.error(`Tenor featured error: ${error.message}`);
    }
  }

  return results;
}

/**
 * Process a search query
 */
async function processQuery(query) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Processing: "${query}"`);
  console.log('='.repeat(50));

  // Fetch from both APIs
  const giphyResults = await fetchFromGiphy(query, MAX_GIFS_PER_SEARCH);
  const tenorResults = await fetchFromTenor(query, MAX_GIFS_PER_SEARCH);

  // Combine and shuffle for variety
  const allGifs = [...giphyResults, ...tenorResults]
    .sort(() => Math.random() - 0.5)
    .slice(0, MAX_GIFS_PER_SEARCH);

  console.log(`Found ${allGifs.length} GIFs from APIs`);

  // Download and cache
  let downloaded = 0;
  let skipped = 0;

  for (const gif of allGifs) {
    if (downloaded >= MAX_GIFS_PER_SEARCH) {
      console.log(`Reached max GIFs per search (${MAX_GIFS_PER_SEARCH})`);
      break;
    }

    const cached = await downloadGif(gif, query, forceRedownload);
    if (cached) {
      addGifToIndex(cached);
      downloaded++;
    } else {
      skipped++;
    }
  }

  console.log(`Downloaded: ${downloaded}, Skipped: ${skipped}`);

  return downloaded;
}

/**
 * Main execution
 */
async function main() {
  console.log('\nGIF Prefetcher');
  console.log('='.repeat(50));
  console.log(`Started at: ${new Date().toISOString()}`);

  // Initialize cache
  initializeCache();

  // Check API keys
  if (!GIPHY_API_KEY && !TENOR_API_KEY) {
    console.error('ERROR: No API keys configured!');
    console.error('Set GIPHY_API_KEY and/or TENOR_API_KEY in .env');
    process.exit(1);
  }

  // Get current health
  const healthBefore = getCacheHealth();
  console.log(`Cache: ${healthBefore.totalGifs} GIFs, ${healthBefore.storageUsedMB}MB used`);

  let totalDownloaded = 0;

  // Handle forced query
  if (forcedQuery) {
    console.log(`\nForced query mode: "${forcedQuery}"`);
    totalDownloaded = await processQuery(forcedQuery);
  } else {
    // Parse queue
    const queue = parseQueueFile();
    console.log(`Queue: ${queue.pending.length} pending, ${queue.completed.length} completed`);

    if (queue.pending.length > 0) {
      // Process first pending item
      const nextQuery = queue.pending[0];
      totalDownloaded = await processQuery(nextQuery);

      // Mark as completed
      if (totalDownloaded > 0) {
        markQueueItemCompleted(nextQuery, totalDownloaded);
        console.log(`Marked "${nextQuery}" as completed`);
      }
    } else {
      // No pending items, fetch trending
      console.log('\nNo pending items in queue, fetching trending...');
      const trendingGifs = await fetchTrending();
      console.log(`Found ${trendingGifs.length} trending GIFs`);

      let downloaded = 0;
      for (const gif of trendingGifs) {
        if (downloaded >= MAX_GIFS_PER_SEARCH) break;

        const cached = await downloadGif(gif, 'trending');
        if (cached) {
          addGifToIndex(cached);
          downloaded++;
        }
      }
      totalDownloaded = downloaded;
      console.log(`Downloaded ${downloaded} trending GIFs`);
    }
  }

  // Update stats
  updateQueueStats();

  // Final health check
  const healthAfter = getCacheHealth();
  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log(`  Downloaded this run: ${totalDownloaded}`);
  console.log(`  Total cached: ${healthAfter.totalGifs} GIFs`);
  console.log(`  Storage: ${healthAfter.storageUsedMB}MB / ${healthAfter.maxStorageMB}MB (${healthAfter.percentUsed}%)`);
  console.log(`  API calls: Giphy ${giphyCalls}/${MAX_GIPHY_CALLS}, Tenor ${tenorCalls}/${MAX_TENOR_CALLS}`);

  // Update run counter
  const stats = loadStats();
  stats.runsCompleted = (stats.runsCompleted || 0) + 1;
  saveStats(stats);

  console.log(`\nCompleted at: ${new Date().toISOString()}`);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
