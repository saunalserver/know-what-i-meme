// Cache Utilities for GIF caching system
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Paths
export const CACHE_DIR = '/mnt/photos/gif-cache';
export const GIFS_DIR = path.join(CACHE_DIR, 'gifs');
export const INDEX_FILE = path.join(CACHE_DIR, 'index.json');
export const STATS_FILE = path.join(CACHE_DIR, 'stats.json');
export const QUEUE_FILE = '/home/saunalserver/obsidian-vault/nexus/01_PROJECTS/know-what-i-meme/GIF_QUEUE.md';

// Limits
export const MAX_GIFS_PER_SEARCH = 100;
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (was 2MB)
export const MIN_DIMENSION = 50; // min 50px (was 100px)
export const MAX_CACHE_SIZE = 30 * 1024 * 1024 * 1024; // 30GB

// Initialize cache files if they don't exist
export function initializeCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!fs.existsSync(GIFS_DIR)) {
    fs.mkdirSync(GIFS_DIR, { recursive: true });
  }
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify({ gifs: {}, tags: {}, contentHashes: {} }, null, 2));
  }
  if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({
      totalCached: 0,
      storageUsed: 0,
      maxStorage: MAX_CACHE_SIZE,
      lastRun: null,
      runsCompleted: 0
    }, null, 2));
  }
}

// Load the GIF index
export function loadIndex() {
  try {
    const data = fs.readFileSync(INDEX_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading index:', error);
    return { gifs: {}, tags: {} };
  }
}

// Save the GIF index
export function saveIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Load stats
export function loadStats() {
  try {
    const data = fs.readFileSync(STATS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      totalCached: 0,
      storageUsed: 0,
      maxStorage: MAX_CACHE_SIZE,
      lastRun: null,
      runsCompleted: 0
    };
  }
}

// Save stats
export function saveStats(stats) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

// Check if GIF already exists in cache
export function gifExists(source, gifId) {
  const index = loadIndex();
  const cacheKey = `${source}:${gifId}`;
  return !!index.gifs[cacheKey];
}

// Compute content hash from buffer
export function computeContentHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// Check if content hash already exists (prevents identical GIFs with different IDs)
export function contentHashExists(contentHash) {
  const index = loadIndex();
  // Ensure contentHashes object exists (for legacy indexes)
  if (!index.contentHashes) {
    index.contentHashes = {};
  }
  return !!index.contentHashes[contentHash];
}

// Add GIF to index
export function addGifToIndex(gif) {
  const index = loadIndex();
  const cacheKey = `${gif.source}:${gif.id}`;

  // Ensure contentHashes object exists (for legacy indexes)
  if (!index.contentHashes) {
    index.contentHashes = {};
  }

  // Don't add duplicates by ID
  if (index.gifs[cacheKey]) {
    return false;
  }

  // Don't add duplicates by content hash
  if (gif.contentHash && index.contentHashes[gif.contentHash]) {
    console.log(`Skipping duplicate content: ${gif.id} (same as ${index.contentHashes[gif.contentHash]})`);
    return false;
  }

  // Add to gifs index
  index.gifs[cacheKey] = {
    id: gif.id,
    source: gif.source,
    title: gif.title,
    localPath: gif.localPath,
    originalUrl: gif.originalUrl,
    previewUrl: gif.previewUrl,
    tags: gif.tags || [],
    width: gif.width,
    height: gif.height,
    fileSize: gif.fileSize,
    searchQuery: gif.searchQuery,
    contentHash: gif.contentHash,
    fetchedAt: new Date().toISOString()
  };

  // Add to content hash index
  if (gif.contentHash) {
    index.contentHashes[gif.contentHash] = cacheKey;
  }

  // Add to tags index
  for (const tag of (gif.tags || [])) {
    const normalizedTag = tag.toLowerCase().trim();
    if (!index.tags[normalizedTag]) {
      index.tags[normalizedTag] = [];
    }
    index.tags[normalizedTag].push(cacheKey);
  }

  // Also index by search query words
  if (gif.searchQuery) {
    const words = gif.searchQuery.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 2 && !index.tags[word]) {
        index.tags[word] = [];
      }
      if (word.length > 2) {
        index.tags[word].push(cacheKey);
      }
    }
  }

  saveIndex(index);
  return true;
}

// Search local cache
export function searchCache(query, limit = 20) {
  const index = loadIndex();
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

  // Score each GIF based on tag/word matches
  const scores = {};

  for (const word of queryWords) {
    // Check exact tag matches
    if (index.tags[word]) {
      for (const cacheKey of index.tags[word]) {
        scores[cacheKey] = (scores[cacheKey] || 0) + 3;
      }
    }

    // Check partial matches in tags
    for (const tag of Object.keys(index.tags)) {
      if (tag.includes(word) || word.includes(tag)) {
        for (const cacheKey of index.tags[tag]) {
          scores[cacheKey] = (scores[cacheKey] || 0) + 1;
        }
      }
    }
  }

  // Sort by score and get top results
  const sortedKeys = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 2)
    .map(([key]) => key);

  // Return GIF data
  const results = [];
  for (const key of sortedKeys) {
    if (index.gifs[key]) {
      results.push(index.gifs[key]);
    }
    if (results.length >= limit) break;
  }

  // If not enough results, add some random cached GIFs
  if (results.length < limit) {
    const allKeys = Object.keys(index.gifs);
    const shuffled = allKeys.sort(() => Math.random() - 0.5);
    for (const key of shuffled) {
      if (!results.find(r => `${r.source}:${r.id}` === key)) {
        results.push(index.gifs[key]);
      }
      if (results.length >= limit) break;
    }
  }

  return results;
}

// Get random cached GIFs
export function getRandomCached(limit = 20) {
  const index = loadIndex();
  const allKeys = Object.keys(index.gifs);
  const shuffled = allKeys.sort(() => Math.random() - 0.5).slice(0, limit);

  return shuffled.map(key => index.gifs[key]).filter(Boolean);
}

// Get all cached GIFs
export function getAllCached() {
  const index = loadIndex();
  return Object.values(index.gifs);
}

// Calculate current storage usage
export function calculateStorageUsed() {
  const index = loadIndex();
  let totalSize = 0;
  for (const gif of Object.values(index.gifs)) {
    totalSize += gif.fileSize || 0;
  }
  return totalSize;
}

// Update stats
export function updateStats() {
  const stats = loadStats();
  const index = loadIndex();

  stats.totalCached = Object.keys(index.gifs).length;
  stats.storageUsed = calculateStorageUsed();
  stats.lastRun = new Date().toISOString();

  saveStats(stats);
  return stats;
}

// Parse the queue markdown file
export function parseQueueFile() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { pending: [], completed: [] };
  }

  const content = fs.readFileSync(QUEUE_FILE, 'utf8');
  const lines = content.split('\n');

  const pending = [];
  const completed = [];
  let inQueueSection = false;
  let inCompletedSection = false;

  for (const line of lines) {
    // Track which section we're in
    if (line.includes('## Queue')) {
      inQueueSection = true;
      inCompletedSection = false;
      continue;
    }
    if (line.includes('## Completed')) {
      inQueueSection = false;
      inCompletedSection = true;
      continue;
    }
    if (line.includes('## Stats')) {
      inQueueSection = false;
      inCompletedSection = false;
      continue;
    }

    // Parse checkbox items
    const uncheckedMatch = line.match(/^- \[ \] (.+)$/);
    const checkedMatch = line.match(/^- \[x\] (.+?)(?:\s*\(fetched|$)/i);

    if (uncheckedMatch && inQueueSection) {
      pending.push(uncheckedMatch[1].trim());
    } else if (checkedMatch && (inQueueSection || inCompletedSection)) {
      completed.push(checkedMatch[1].trim());
    }
  }

  return { pending, completed };
}

// Mark a search term as completed in the queue file
export function markQueueItemCompleted(searchTerm, gifCount) {
  if (!fs.existsSync(QUEUE_FILE)) {
    console.log('Queue file not found');
    return false;
  }

  let content = fs.readFileSync(QUEUE_FILE, 'utf8');
  const date = new Date().toISOString().split('T')[0];

  // Find and replace the unchecked item with checked version
  const regex = new RegExp(`^- \\[ \\] ${escapeRegex(searchTerm)}$`, 'm');
  const replacement = `- [x] ${searchTerm} (fetched ${date}, ${gifCount} GIFs)`;

  if (regex.test(content)) {
    // Remove from Queue section
    content = content.replace(regex, '');

    // Add to Completed section
    const completedSectionMatch = content.match(/## Completed\n/);
    if (completedSectionMatch) {
      content = content.replace(
        /## Completed\n/,
        `## Completed\n\n${replacement}\n`
      );
    } else {
      // Add Completed section if it doesn't exist
      content = content.replace(
        /## Stats/,
        `## Completed\n\n${replacement}\n\n## Stats`
      );
    }

    fs.writeFileSync(QUEUE_FILE, content);
    return true;
  }

  return false;
}

// Update stats section in queue file
export function updateQueueStats() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return;
  }

  const stats = updateStats();
  let content = fs.readFileSync(QUEUE_FILE, 'utf8');

  const storageUsedMB = Math.round(stats.storageUsed / (1024 * 1024));
  const maxStorageMB = Math.round(stats.maxStorage / (1024 * 1024));

  const newStatsBlock = `## Stats

\`\`\`
Total cached: ${stats.totalCached} GIFs
Storage used: ${storageUsedMB} MB / ${maxStorageMB} MB
Last run: ${stats.lastRun || 'Never'}
\`\`\``;

  // Replace the stats section
  content = content.replace(
    /## Stats[\s\S]*$/,
    newStatsBlock
  );

  fs.writeFileSync(QUEUE_FILE, content);
}

// Helper to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generate a safe filename for a GIF
export function generateSafeFilename(source, gifId, originalUrl) {
  const ext = originalUrl.endsWith('.mp4') ? '.mp4' : '.gif';
  const hash = crypto.createHash('md5').update(`${source}:${gifId}`).digest('hex').substring(0, 8);
  return `${source}_${gifId}_${hash}${ext}`;
}

// Check if we have space for more GIFs
export function hasSpaceForMore(estimatedSize = 500 * 1024) {
  const stats = loadStats();
  return (stats.storageUsed + estimatedSize) < MAX_CACHE_SIZE;
}

// Get cache health status
export function getCacheHealth() {
  const stats = loadStats();
  const index = loadIndex();

  return {
    totalGifs: Object.keys(index.gifs).length,
    totalTags: Object.keys(index.tags).length,
    storageUsed: stats.storageUsed,
    storageUsedMB: Math.round(stats.storageUsed / (1024 * 1024)),
    maxStorageMB: Math.round(MAX_CACHE_SIZE / (1024 * 1024)),
    percentUsed: Math.round((stats.storageUsed / MAX_CACHE_SIZE) * 100),
    lastRun: stats.lastRun,
    runsCompleted: stats.runsCompleted
  };
}

export default {
  initializeCache,
  loadIndex,
  saveIndex,
  loadStats,
  saveStats,
  gifExists,
  addGifToIndex,
  searchCache,
  getRandomCached,
  getAllCached,
  calculateStorageUsed,
  updateStats,
  parseQueueFile,
  markQueueItemCompleted,
  updateQueueStats,
  generateSafeFilename,
  hasSpaceForMore,
  getCacheHealth
};
