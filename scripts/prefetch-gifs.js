#!/usr/bin/env node
/**
 * GIF Prefetcher Script
 * Runs hourly to fetch and cache GIFs from Giphy only
 *
 * Usage: node scripts/prefetch-gifs.js [--force] [--query="search term"]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables (use absolute path for cron compatibility)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
  computeContentHash,
  contentHashExists,
  MAX_GIFS_PER_SEARCH,
  MAX_FILE_SIZE,
  MIN_DIMENSION,
  GIFS_DIR
} from './cache-utils.js';

// API Configuration - Giphy only
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

// Rate limiting (Giphy beta: 100/hour)
const MAX_GIPHY_CALLS_PER_HOUR = 95; // Leave buffer for live search
const MAX_QUEUE_ITEMS_PER_RUN = 4; // Process 4 items per run (8 API calls max)
const HOUR_IN_MS = 60 * 60 * 1000;

// Track API calls this session
let giphyCallsThisRun = 0;

// Parse command line args
const args = process.argv.slice(2);
const forceRun = args.includes('--force');
const forceRedownload = args.includes('--refetch');
// Parse query argument - handles quoted values
const queryArg = args.find(a => a.startsWith('--query='));
let forcedQuery = null;
if (queryArg) {
  // Remove surrounding quotes and clean up
  forcedQuery = queryArg.split('=')[1].replace(/"/g, '');
  // Handle "the rock" as a query
  if (forcedQuery === 'the rock') {
    forcedQuery = 'the rock';
  } else {
    forcedQuery = queryArg.split('=')[1].replace(/"/g, '');
  }
}

/**
 * Check if we've exceeded hourly rate limit (persists across runs)
 */
function checkRateLimit() {
  const stats = loadStats();
  const now = Date.now();

  // Initialize rate limit tracking if not exists
  if (!stats.rateLimit) {
    stats.rateLimit = {
      giphyCalls: 0,
      windowStart: now
    };
    saveStats(stats);
    return { allowed: true, remaining: MAX_GIPHY_CALLS_PER_HOUR };
  }

  // Reset counter if hour has passed
  if (now - stats.rateLimit.windowStart >= HOUR_IN_MS) {
    stats.rateLimit = {
      giphyCalls: 0,
      windowStart: now
    };
    saveStats(stats);
    return { allowed: true, remaining: MAX_GIPHY_CALLS_PER_HOUR };
  }

  const remaining = MAX_GIPHY_CALLS_PER_HOUR - stats.rateLimit.giphyCalls;
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    resetsIn: HOUR_IN_MS - (now - stats.rateLimit.windowStart)
  };
}

/**
 * Increment rate limit counter
 */
function incrementRateLimit() {
  const stats = loadStats();
  if (!stats.rateLimit) {
    stats.rateLimit = { giphyCalls: 0, windowStart: Date.now() };
  }
  stats.rateLimit.giphyCalls++;
  saveStats(stats);
  giphyCallsThisRun++;
}

/**
 * Sleep for ms milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry(url, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      // Rate limit exceeded
      if (response.status === 429) {
        console.log('Rate limit exceeded (429). Stopping for this hour.');
        return { rateLimited: true };
      }

      // Client error - don't retry
      if (response.status >= 400 && response.status < 500) {
        console.error(`Client error ${response.status} - not retrying`);
        return { error: `Client error: ${response.status}`, noRetry: true };
      }

      // Server error - retry with backoff
      if (response.status >= 500) {
        const backoff = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`Server error ${response.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        return { error: `HTTP ${response.status}` };
      }

      return { success: true, response };
    } catch (error) {
      lastError = error;
      const backoff = Math.pow(2, attempt) * 1000;
      console.log(`Fetch error: ${error.message}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(backoff);
    }
  }

  return { error: lastError?.message || 'Max retries exceeded' };
}

/**
 * Fetch GIFs from Giphy (handles pagination to get up to 100)
 */
async function fetchFromGiphy(query, limit = 100) {
  if (!GIPHY_API_KEY) {
    console.log('Giphy API key not configured');
    return { gifs: [], rateLimited: false };
  }

  // Check rate limit before starting
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    console.log(`Rate limit exceeded. Resets in ${Math.round(rateCheck.resetsIn / 60000)} minutes.`);
    return { gifs: [], rateLimited: true };
  }

  const allResults = [];
  const perPage = 50; // Giphy max per request
  const pagesNeeded = Math.ceil(limit / perPage);

  for (let page = 0; page < pagesNeeded; page++) {
    // Check rate limit before each request
    const check = checkRateLimit();
    if (!check.allowed) {
      console.log(`Rate limit reached. Resets in ${Math.round(check.resetsIn / 60000)} minutes.`);
      break;
    }

    try {
      const offset = page * perPage;
      const url = new URL(`${GIPHY_BASE_URL}/search`);
      url.searchParams.set('api_key', GIPHY_API_KEY);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', perPage.toString());
      url.searchParams.set('offset', offset.toString());
      url.searchParams.set('rating', 'pg-13');
      url.searchParams.set('lang', 'en');

      console.log(`Fetching from Giphy: "${query}" (page ${page + 1}/${pagesNeeded}) [${check.remaining} calls remaining]`);

      const result = await fetchWithRetry(url.toString());

      if (result.rateLimited) {
        return { gifs: allResults, rateLimited: true };
      }

      if (result.noRetry) {
        console.error(`Permanent error, stopping: ${result.error}`);
        break;
      }

      if (!result.success) {
        console.error(`Failed to fetch: ${result.error}`);
        break;
      }

      incrementRateLimit();
      const data = await result.response.json();

      const pageResults = data.data.map(gif => ({
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

      allResults.push(...pageResults);

      // Stop if we got fewer results than requested (no more available)
      if (pageResults.length < perPage) {
        break;
      }
    } catch (error) {
      console.error(`Giphy fetch error: ${error.message}`);
      break;
    }
  }

  return { gifs: allResults.slice(0, limit), rateLimited: false };
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
 * Add failed download to retry queue
 */
function addFailedDownload(gif, searchQuery, error) {
  const stats = loadStats();
  if (!stats.failedDownloads) {
    stats.failedDownloads = [];
  }

  // Check if already in queue
  const existing = stats.failedDownloads.find(f => f.id === gif.id && f.source === gif.source);
  if (existing) {
    existing.attempts++;
    existing.lastError = error;
    existing.lastAttempt = new Date().toISOString();
  } else {
    stats.failedDownloads.push({
      id: gif.id,
      source: gif.source,
      originalUrl: gif.originalUrl,
      previewUrl: gif.previewUrl,
      title: gif.title,
      width: gif.width,
      height: gif.height,
      fileSize: gif.fileSize,
      tags: gif.tags,
      searchQuery: searchQuery,
      attempts: 1,
      lastError: error,
      lastAttempt: new Date().toISOString()
    });
  }

  // Remove items with too many attempts (max 3)
  stats.failedDownloads = stats.failedDownloads.filter(f => f.attempts < 3);
  saveStats(stats);
}

/**
 * Get failed downloads for retry
 */
function getFailedDownloads() {
  const stats = loadStats();
  return stats.failedDownloads || [];
}

/**
 * Clear failed download from queue
 */
function clearFailedDownload(gifId, source) {
  const stats = loadStats();
  if (stats.failedDownloads) {
    stats.failedDownloads = stats.failedDownloads.filter(f => !(f.id === gifId && f.source === source));
    saveStats(stats);
  }
}

/**
 * Download a GIF to local storage
 */
async function downloadGif(gif, searchQuery, skipDupeCheck = false) {
  // Validate GIF
  if (!gif.originalUrl) {
    return { success: false, reason: 'no_url' };
  }

  // Check dimensions
  if (gif.width < MIN_DIMENSION || gif.height < MIN_DIMENSION) {
    return { success: false, reason: 'too_small' };
  }

  // Check file size (if known)
  if (gif.fileSize > MAX_FILE_SIZE) {
    return { success: false, reason: 'too_large' };
  }

  // Check for duplicates by ID (skip if force redownload)
  if (!skipDupeCheck && gifExists(gif.source, gif.id)) {
    return { success: false, reason: 'duplicate_id' };
  }

  // Check storage space
  if (!hasSpaceForMore(gif.fileSize || 500 * 1024)) {
    console.log('Cache storage limit reached');
    return { success: false, reason: 'storage_full' };
  }

  try {
    // Generate filename
    const filename = generateSafeFilename(gif.source, gif.id, gif.originalUrl);
    const localPath = path.join(GIFS_DIR, filename);

    // Download the GIF
    console.log(`Downloading: ${gif.id}`);
    const response = await fetch(gif.originalUrl);

    if (!response.ok) {
      const error = `HTTP ${response.status}`;
      console.error(`Download failed: ${error}`);
      return { success: false, reason: 'download_failed', error, gif };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const actualSize = buffer.length;

    // Double-check size after download
    if (actualSize > MAX_FILE_SIZE) {
      return { success: false, reason: 'too_large_after_download' };
    }

    // Compute content hash and check for duplicates
    const contentHash = computeContentHash(buffer);
    if (!skipDupeCheck && contentHashExists(contentHash)) {
      return { success: false, reason: 'duplicate_content' };
    }

    // Write to disk
    fs.writeFileSync(localPath, buffer);

    // Get actual dimensions if we couldn't get them from API
    const width = gif.width || 200;
    const height = gif.height || 200;

    return {
      success: true,
      data: {
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
        contentHash: contentHash,
        searchQuery: searchQuery
      }
    };
  } catch (error) {
    console.error(`Error downloading ${gif.id}: ${error.message}`);
    return { success: false, reason: 'exception', error: error.message, gif };
  }
}

/**
 * Fetch trending GIFs from Giphy (fallback when queue is empty)
 */
async function fetchTrending(limit = MAX_GIFS_PER_SEARCH) {
  console.log('Fetching trending GIFs from Giphy...');

  if (!GIPHY_API_KEY) {
    console.log('Giphy API key not configured');
    return { gifs: [], rateLimited: false };
  }

  // Check rate limit before starting
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    console.log(`Rate limit exceeded. Resets in ${Math.round(rateCheck.resetsIn / 60000)} minutes.`);
    return { gifs: [], rateLimited: true };
  }

  const allResults = [];
  const perPage = 50;
  const pagesNeeded = Math.ceil(limit / perPage);

  for (let page = 0; page < pagesNeeded; page++) {
    const check = checkRateLimit();
    if (!check.allowed) {
      console.log(`Rate limit reached. Resets in ${Math.round(check.resetsIn / 60000)} minutes.`);
      break;
    }

    try {
      const offset = page * perPage;
      const url = new URL(`${GIPHY_BASE_URL}/trending`);
      url.searchParams.set('api_key', GIPHY_API_KEY);
      url.searchParams.set('limit', perPage.toString());
      url.searchParams.set('offset', offset.toString());
      url.searchParams.set('rating', 'pg-13');

      console.log(`Fetching trending (page ${page + 1}/${pagesNeeded}) [${check.remaining} calls remaining]`);

      const result = await fetchWithRetry(url.toString());

      if (result.rateLimited) {
        return { gifs: allResults, rateLimited: true };
      }

      if (!result.success) {
        console.error(`Failed to fetch trending: ${result.error}`);
        break;
      }

      incrementRateLimit();
      const data = await result.response.json();

      const pageResults = data.data.map(gif => ({
        id: gif.id,
        source: 'giphy',
        title: gif.title || 'Trending',
        originalUrl: gif.images.original?.url,
        previewUrl: gif.images.preview_gif?.url || gif.images.downsized?.url,
        width: parseInt(gif.images.original?.width || 0),
        height: parseInt(gif.images.original?.height || 0),
        tags: extractTags(gif),
        fileSize: parseInt(gif.images.original?.size || 0)
      }));

      allResults.push(...pageResults);

      if (pageResults.length < perPage) {
        break;
      }
    } catch (error) {
      console.error(`Giphy trending error: ${error.message}`);
      break;
    }
  }

  return { gifs: allResults.slice(0, limit), rateLimited: false };
}

/**
 * Process a search query - fetches 100 GIFs from Giphy only
 * @returns {Object} { downloaded, rateLimited }
 */
async function processQuery(query) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Processing: "${query}"`);
  console.log('='.repeat(50));

  // Fetch from Giphy only (100 GIFs)
  const fetchResult = await fetchFromGiphy(query, MAX_GIFS_PER_SEARCH);

  if (fetchResult.rateLimited) {
    console.log('Rate limited during fetch - stopping');
    return { downloaded: 0, rateLimited: true };
  }

  console.log(`Found ${fetchResult.gifs.length} GIFs from Giphy`);

  // Download and cache - keep going until we have 100 downloads
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const gif of fetchResult.gifs) {
    if (downloaded >= MAX_GIFS_PER_SEARCH) {
      console.log(`Reached target: ${MAX_GIFS_PER_SEARCH} GIFs downloaded`);
      break;
    }

    const result = await downloadGif(gif, query, forceRedownload);

    if (result.success) {
      addGifToIndex(result.data);
      downloaded++;
    } else if (result.reason === 'download_failed' || result.reason === 'exception') {
      // Queue for retry on next run
      addFailedDownload(gif, query, result.error || result.reason);
      failed++;
    } else {
      skipped++;
    }
  }

  console.log(`Downloaded: ${downloaded}, Skipped: ${skipped}, Failed (queued): ${failed}`);

  return { downloaded, rateLimited: false };
}

/**
 * Main execution
 */
async function main() {
  console.log('\nGIF Prefetcher (Giphy only)');
  console.log('='.repeat(50));
  console.log(`Started at: ${new Date().toISOString()}`);

  // Initialize cache
  initializeCache();

  // Check API key
  if (!GIPHY_API_KEY) {
    console.error('ERROR: GIPHY_API_KEY not configured!');
    console.error('Set GIPHY_API_KEY in .env');
    process.exit(1);
  }

  // Check rate limit at start
  const rateCheck = checkRateLimit();
  console.log(`Rate limit: ${rateCheck.remaining}/${MAX_GIPHY_CALLS_PER_HOUR} calls remaining`);
  if (!rateCheck.allowed) {
    console.log(`Rate limit exceeded. Try again in ${Math.round(rateCheck.resetsIn / 60000)} minutes.`);
    process.exit(0);
  }

  // Get current health
  const healthBefore = getCacheHealth();
  console.log(`Cache: ${healthBefore.totalGifs} GIFs, ${healthBefore.storageUsedMB}MB used`);

  let totalDownloaded = 0;
  let wasRateLimited = false;

  // First, retry any failed downloads from previous runs
  const failedDownloads = getFailedDownloads();
  if (failedDownloads.length > 0) {
    console.log(`\nRetrying ${failedDownloads.length} failed downloads...`);
    let retried = 0;
    let recovered = 0;

    for (const failed of failedDownloads) {
      const result = await downloadGif(failed, failed.searchQuery, false);

      if (result.success) {
        addGifToIndex(result.data);
        clearFailedDownload(failed.id, failed.source);
        recovered++;
        totalDownloaded++;
      } else {
        // Will be re-queued with incremented attempt count
        addFailedDownload(failed, failed.searchQuery, result.error || result.reason);
      }
      retried++;
    }

    console.log(`Retry complete: ${recovered}/${retried} recovered`);
  }

  // Handle forced query
  if (forcedQuery) {
    console.log(`\nForced query mode: "${forcedQuery}"`);
    const result = await processQuery(forcedQuery);
    totalDownloaded += result.downloaded;
    wasRateLimited = result.rateLimited;
  } else {
    // Parse queue
    const queue = parseQueueFile();
    console.log(`Queue: ${queue.pending.length} pending, ${queue.completed.length} completed`);

    if (queue.pending.length > 0 && !wasRateLimited) {
      // Process multiple queue items per run
      const itemsToProcess = Math.min(MAX_QUEUE_ITEMS_PER_RUN, queue.pending.length);
      console.log(`Processing ${itemsToProcess} queue items this run...`);

      for (let i = 0; i < itemsToProcess; i++) {
        if (wasRateLimited) {
          console.log('Rate limited - stopping queue processing');
          break;
        }

        const nextQuery = queue.pending[i];
        const result = await processQuery(nextQuery);

        // Mark as completed (even if 0 downloaded - API call was successful)
        if (!result.rateLimited) {
          markQueueItemCompleted(nextQuery, result.downloaded);
          console.log(`Marked "${nextQuery}" as completed`);
        }
        totalDownloaded += result.downloaded;
        wasRateLimited = result.rateLimited;
      }
    } else if (queue.pending.length === 0) {
      // No pending items, fetch trending
      console.log('\nNo pending items in queue, fetching trending...');
      const trendingResult = await fetchTrending();

      if (trendingResult.rateLimited) {
        console.log('Rate limited during trending fetch');
      } else {
        console.log(`Found ${trendingResult.gifs.length} trending GIFs`);

        let downloaded = 0;
        for (const gif of trendingResult.gifs) {
          if (downloaded >= MAX_GIFS_PER_SEARCH) break;

          const result = await downloadGif(gif, 'trending');
          if (result.success) {
            addGifToIndex(result.data);
            downloaded++;
          }
        }
        totalDownloaded = downloaded;
        console.log(`Downloaded ${downloaded} trending GIFs`);
      }
    }
  }

  // Update stats
  updateQueueStats();

  // Get final rate limit status
  const finalRateCheck = checkRateLimit();

  // Final health check
  const healthAfter = getCacheHealth();
  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log(`  Downloaded this run: ${totalDownloaded}`);
  console.log(`  Total cached: ${healthAfter.totalGifs} GIFs`);
  console.log(`  Storage: ${healthAfter.storageUsedMB}MB / ${healthAfter.maxStorageMB}MB (${healthAfter.percentUsed}%)`);
  console.log(`  API calls this run: ${giphyCallsThisRun}`);
  console.log(`  Rate limit: ${finalRateCheck.remaining}/${MAX_GIPHY_CALLS_PER_HOUR} remaining`);

  // Show failed downloads queue status
  const remainingFailed = getFailedDownloads();
  if (remainingFailed.length > 0) {
    console.log(`  Failed downloads pending retry: ${remainingFailed.length}`);
  }

  // Update run counter
  const stats = loadStats();
  stats.runsCompleted = (stats.runsCompleted || 0) + 1;
  saveStats(stats);

  if (wasRateLimited) {
    console.log(`\nRate limited - will continue next hour`);
  }

  console.log(`\nCompleted at: ${new Date().toISOString()}`);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
