import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchJson } from '../../services/api'
import { seenGifIds, rememberGif } from '../../utils/gifHistory'

// Long enough not to fire on every keystroke, short enough that the grid feels
// responsive. The old 2s wait felt broken on a 60s round.
const SEARCH_DEBOUNCE_MS = 650
const MIN_QUERY_LENGTH = 2
const PAGE_SIZE = 21 // Fills the 3-column grid exactly

export function GifSearch({ onSelect, selectedGif }) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  // Abort a request whose results nobody wants any more.
  const requestRef = useRef(null)

  // Runs every fetch: one loading flag, one error path, one abort.
  const load = useCallback(async (path, { category = null } = {}) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    setActiveCategory(category)

    try {
      const data = await fetchJson(path, { signal: controller.signal })
      // Prefer GIFs this player hasn't already been shown, but never show an
      // empty grid just because they've browsed a lot.
      const unseen = data.filter(gif => !seenGifIds.has(String(gif.id)))
      setGifs(unseen.length > 0 ? unseen : data)
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message || 'Could not load GIFs')
      setGifs([])
    } finally {
      if (requestRef.current === controller) setLoading(false)
    }
  }, [])

  const fetchTrending = useCallback(
    (fresh = false) => load(`/api/gif/trending?limit=${PAGE_SIZE}&fresh=${fresh}`),
    [load]
  )

  const fetchRandom = useCallback(() => load(`/api/gif/random?limit=${PAGE_SIZE}`), [load])

  const fetchByCategory = useCallback(
    (categoryId) => load(`/api/gif/category/${categoryId}?limit=${PAGE_SIZE}`, { category: categoryId }),
    [load]
  )

  const searchGifs = useCallback(
    (searchQuery) => {
      const trimmed = searchQuery.trim()
      if (trimmed.length < MIN_QUERY_LENGTH) return fetchTrending()
      const exclude = Array.from(seenGifIds).slice(-50).join(',')
      return load(
        `/api/gif/search?q=${encodeURIComponent(trimmed)}&limit=${PAGE_SIZE}&exclude=${exclude}`
      )
    },
    [load, fetchTrending]
  )

  // Categories and a first page of trending
  useEffect(() => {
    fetchJson('/api/gif/categories').then(setCategories).catch(() => {})
  }, [])

  useEffect(() => {
    fetchTrending(true)
  }, [fetchTrending])

  // Debounced search-as-you-type
  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) return
    const timer = setTimeout(() => searchGifs(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, searchGifs])

  // Abort anything in flight on unmount
  useEffect(() => () => requestRef.current?.abort(), [])

  const handleSelect = (gif) => {
    rememberGif(gif.id)
    onSelect(gif.url)
  }

  const handleShuffle = () => {
    if (activeCategory) return fetchByCategory(activeCategory)
    if (query.trim().length >= MIN_QUERY_LENGTH) return searchGifs(query)
    return fetchRandom()
  }

  const handleCategoryClick = (categoryId) => {
    if (activeCategory === categoryId) {
      setQuery('')
      fetchTrending()
    } else {
      fetchByCategory(categoryId)
    }
  }

  return (
    <div className="w-full flex flex-col h-full">
      <div className="relative mb-3 flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchGifs(query)}
            placeholder="Search GIFs…"
            aria-label="Search GIFs"
            enterKeyHint="search"
            className="input w-full pr-16"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {query && (
              <button
                onClick={() => { setQuery(''); fetchTrending() }}
                aria-label="Clear search"
                className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors"
              >
                ✕
              </button>
            )}
            <button
              onClick={handleShuffle}
              aria-label="Show different GIFs"
              title="Shuffle"
              className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-accent hover:bg-white/5 transition-colors"
            >
              🎲
            </button>
          </div>
        </div>
        <button
          onClick={() => searchGifs(query)}
          disabled={query.trim().length < MIN_QUERY_LENGTH || loading}
          aria-label="Search"
          className="w-14 shrink-0 grid place-items-center bg-accent text-white rounded-xl text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
        >
          {loading ? '⏳' : '🔍'}
        </button>
      </div>

      <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scroll-fade-x -mx-1 px-1">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat.id)}
            className={`px-3.5 py-2 rounded-full text-sm whitespace-nowrap border transition-colors ${
              activeCategory === cat.id
                ? 'bg-accent border-accent text-white'
                : 'bg-dark-elevated border-line text-text-secondary hover:bg-dark-tertiary'
            }`}
          >
            {cat.emoji} {cat.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-error/20 text-error p-3 rounded-lg mb-3 flex items-center justify-between gap-3">
          <span className="text-sm">{error}</span>
          <button onClick={handleShuffle} className="text-sm underline shrink-0">Retry</button>
        </div>
      )}

      {selectedGif && (
        <div className="mb-3 flex items-center gap-3 bg-dark-secondary border border-accent/50 rounded-xl p-2">
          <img src={selectedGif} alt="Selected GIF" className="w-16 h-16 object-cover rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-accent text-sm font-bold">Your pick</p>
            <p className="text-text-muted text-xs">Tap another to change it</p>
          </div>
          <button
            onClick={() => onSelect(null)}
            aria-label="Deselect GIF"
            className="w-9 h-9 shrink-0 grid place-items-center rounded-lg bg-dark-tertiary text-text-secondary hover:text-error transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Safari needs the GPU hints below to scroll a grid of GIFs smoothly. */}
      <div
        className="grid grid-cols-3 gap-2 flex-1 overflow-y-auto pr-1 content-start"
        style={{
          minHeight: '35vh',
          transform: 'translateZ(0)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {gifs.map((gif) => (
          <button
            key={gif.id}
            onClick={() => handleSelect(gif)}
            // The tile carries its own surface: a cell whose GIF has not
            // arrived yet used to paint nothing at all, so a part-loaded grid
            // read as holes punched in the layout rather than as loading.
            className={`relative aspect-square rounded-xl overflow-hidden bg-dark-secondary transition-transform active:scale-95 ${
              selectedGif === gif.url ? 'ring-[3px] ring-accent' : ''
            }`}
            style={{ transform: 'translateZ(0)' }}
          >
            <img
              src={gif.preview || gif.url}
              alt={gif.title || 'GIF'}
              className="w-full h-full object-cover"
              loading="lazy"
              style={{ display: 'block' }}
            />
          </button>
        ))}

        {/* Placeholders keep the grid from collapsing while a page loads */}
        {loading && gifs.length === 0 &&
          Array.from({ length: 9 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="aspect-square rounded-xl bg-dark-secondary animate-pulse" />
          ))}
      </div>

      {!loading && gifs.length === 0 && !error && (
        <div className="text-center py-8 text-text-secondary">
          No GIFs found. Try another search or 🎲 shuffle.
        </div>
      )}

      {!loading && gifs.length > 0 && (
        <button
          onClick={handleShuffle}
          className="w-full mt-2 py-2.5 text-sm text-text-muted hover:text-accent transition-colors shrink-0"
        >
          🎲 Show me different GIFs
        </button>
      )}
    </div>
  )
}

export default GifSearch
