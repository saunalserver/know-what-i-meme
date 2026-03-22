#!/usr/bin/env node
/**
 * Rebuild index from existing GIF files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE_DIR = '/mnt/photos/gif-cache';
const GIFS_DIR = path.join(CACHE_DIR, 'gifs');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');

// Get all GIF files
const files = fs.readdirSync(GIFS_DIR).filter(f => f.endsWith('.gif'));

console.log(`Found ${files.length} GIF files`);

// Build new index
const gifs = {};
const tags = {};
const contentHashes = {};

for (const file of files) {
  const filePath = path.join(GIFS_DIR, file);
  const stats = fs.statSync(filePath);

  // Parse filename: source_id_hash.gif
  const match = file.match(/^(giphy|tenor)_(.+)_([a-f0-9]+)\.gif$/);
  if (!match) {
    console.log(`Skipping malformed filename: ${file}`);
    continue;
  }

  const [, source, id] = match;
  const cacheKey = `${source}:${id}`;

  // Compute content hash
  const buffer = fs.readFileSync(filePath);
  const contentHash = crypto.createHash('md5').update(buffer).digest('hex');

  gifs[cacheKey] = {
    id,
    source,
    title: id,
    localPath: filePath,
    originalUrl: '',
    previewUrl: '',
    tags: [],
    width: 200,
    height: 200,
    fileSize: stats.size,
    contentHash,
    searchQuery: 'recovered',
    fetchedAt: new Date().toISOString()
  };

  contentHashes[contentHash] = cacheKey;
}

// Save index
fs.writeFileSync(INDEX_FILE, JSON.stringify({ gifs, tags, contentHashes }, null, 2));
console.log(`Rebuilt index with ${Object.keys(gifs).length} GIFs`);
