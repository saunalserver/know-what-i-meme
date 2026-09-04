import { Router } from 'express';

import { gifService } from '../services/gifService.js';
import { gifCache } from '../services/gifCache.js';
import { gameStore } from '../data/gameStore.js';

// Clamp a user-supplied ?limit= to something the GIF API will accept.
function parseLimit(value, fallback = 20) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 1), 50);
}

// Turn a service error into a status code: a missing key is our fault,
// an upstream hiccup is a bad gateway, anything else is a 500.
function gifErrorStatus(error) {
  if (/not configured/i.test(error.message)) return 503;
  if (/Klipy API error|unavailable/i.test(error.message)) return 502;
  return 500;
}

// GIFs served from the local pool come back as "local:<file>". Only the HTTP
// layer knows what prefix it is mounted under, so it fills that in here --
// '' at the root, '/kwim' behind the proxy.
function withBaseUrl(gifs, baseUrl) {
  const prefix = `${baseUrl}/api/gif/local/`;
  return gifs.map(gif => (
    typeof gif.url === 'string' && gif.url.startsWith('local:')
      ? { ...gif, url: prefix + gif.url.slice(6), preview: prefix + gif.preview.slice(6) }
      : gif
  ));
}

function sendGifs(req, res, promise) {
  return promise
    .then(gifs => res.json(withBaseUrl(gifs, req.baseUrl)))
    .catch(error => res.status(gifErrorStatus(error)).json({ error: error.message }));
}

// One router, mounted at both '/' and '/kwim' so the same URLs work in dev
// (served by Vite on :5173) and in production (served behind the /kwim prefix).
export function createApiRouter() {
  const router = Router();

  router.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      rooms: gameStore.getStats(),
    });
  });

  router.get('/api/gif/search', (req, res) => {
    const { q, exclude } = req.query;
    if (!q || !String(q).trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const excludeIds = exclude ? String(exclude).split(',').filter(Boolean) : [];
    sendGifs(req, res, gifService.search(String(q), parseLimit(req.query.limit), excludeIds));
  });

  router.get('/api/gif/trending', (req, res) => {
    sendGifs(req, res, gifService.getTrending(parseLimit(req.query.limit), req.query.fresh === 'true'));
  });

  router.get('/api/gif/random', (req, res) => {
    sendGifs(req, res, gifService.getRandom(parseLimit(req.query.limit)));
  });

  router.get('/api/gif/category/:categoryId', (req, res) => {
    sendGifs(req, res, gifService.getByCategory(req.params.categoryId, parseLimit(req.query.limit)));
  });

  router.get('/api/gif/categories', (req, res) => {
    res.json(gifService.getCategories());
  });

  router.get('/api/gif/emoji-map', (req, res) => {
    res.json(gifService.getEmojiMap());
  });

  // A GIF held in the local pool. Only files the pool knows about resolve, so
  // a crafted name cannot reach anything else on disk.
  router.get('/api/gif/local/:file', (req, res) => {
    const filePath = gifCache.resolve(req.params.file);
    if (!filePath) return res.status(404).json({ error: 'Not found' });
    res.sendFile(filePath, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    }, error => {
      if (error && !res.headersSent) res.status(404).end();
    });
  });

  router.get('/api/gif/usage', (req, res) => {
    res.json(gifService.getUsageStats());
  });

  return router;
}

export default createApiRouter;
