import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Always use current hostname for API calls (works on Tailscale/LAN)
const getApiUrl = () => {
  const protocol = window.location.protocol
  const hostname = window.location.hostname
  return `${protocol}//${hostname}:3002`
}

const API_URL = getApiUrl()

// Track seen GIFs globally (persisted across component remounts within a game)
const seenGifIds = new Set()

export function GifSearch({ onSelect, selectedGif }) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const inputRef = useRef(null)

  // Load categories on mount
  useEffect(() => {
    fetch(`${API_URL}/api/gif/categories`)
      .then(res => res.json())
      .then(setCategories)
      .catch(() => {})
  }, [])

  // Load trending GIFs on mount
  useEffect(() => {
    fetchTrending(true)
  }, [])

  const fetchTrending = async (fresh = false) => {
    setLoading(true)
    setError(null)
    setActiveCategory(null)
    try {
      const res = await fetch(`${API_URL}/api/gif/trending?limit=20&fresh=${fresh}`)
      if (!res.ok) throw new Error('Failed to fetch trending')
      const data = await res.json()
      // Filter out seen GIFs
      const newGifs = data.filter(gif => !seenGifIds.has(gif.id))
      setGifs(newGifs.length > 0 ? newGifs : data.slice(0, 10))
    } catch (err) {
      setError('Failed to load GIFs (API key needed)')
    } finally {
      setLoading(false)
    }
  }

  const fetchRandom = async () => {
    setLoading(true)
    setError(null)
    setActiveCategory(null)
    try {
      const res = await fetch(`${API_URL}/api/gif/random?limit=20`)
      if (!res.ok) throw new Error('Failed to fetch random')
      const data = await res.json()
      const newGifs = data.filter(gif => !seenGifIds.has(gif.id))
      setGifs(newGifs.length > 0 ? newGifs : data)
    } catch (err) {
      setError('Failed to load GIFs')
    } finally {
      setLoading(false)
    }
  }

  const fetchByCategory = async (categoryId) => {
    setLoading(true)
    setError(null)
    setActiveCategory(categoryId)
    try {
      const res = await fetch(`${API_URL}/api/gif/category/${categoryId}?limit=20`)
      if (!res.ok) throw new Error('Failed to fetch category')
      const data = await res.json()
      const newGifs = data.filter(gif => !seenGifIds.has(gif.id))
      setGifs(newGifs.length > 0 ? newGifs : data)
    } catch (err) {
      setError('Failed to load GIFs')
    } finally {
      setLoading(false)
    }
  }

  const searchGifs = useCallback(async (searchQuery) => {
    if (!searchQuery.trim()) {
      fetchTrending()
      return
    }

    setLoading(true)
    setError(null)
    setActiveCategory(null)
    try {
      const excludeIds = Array.from(seenGifIds).slice(-50).join(',') // Last 50 seen
      const res = await fetch(`${API_URL}/api/gif/search?q=${encodeURIComponent(searchQuery)}&limit=20&exclude=${excludeIds}`)
      if (!res.ok) throw new Error('Failed to search')
      const data = await res.json()
      setGifs(data)
    } catch (err) {
      setError('Failed to search GIFs (API key needed)')
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        searchGifs(query)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, searchGifs])

  const handleSelect = (gif) => {
    seenGifIds.add(gif.id)
    onSelect(gif.url)
  }

  const handleCategoryClick = (categoryId) => {
    if (activeCategory === categoryId) {
      // Deselect - go back to trending
      fetchTrending()
    } else {
      fetchByCategory(categoryId)
    }
  }

  const handleShuffle = () => {
    if (activeCategory) {
      fetchByCategory(activeCategory)
    } else if (query) {
      searchGifs(query)
    } else {
      fetchRandom()
    }
  }

  return (
    <div className="w-full flex flex-col h-full">
      {/* Search Input */}
      <div className="relative mb-3">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs or type emoji 😂"
          className="input pr-20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          <button
            onClick={handleShuffle}
            className="p-1 text-text-muted hover:text-accent transition-colors"
            title="Shuffle / Get new GIFs"
          >
            🎲
          </button>
          <span className="text-text-muted">
            {loading ? '⏳' : '🔍'}
          </span>
        </div>
      </div>

      {/* Category Buttons */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat.id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? 'bg-accent text-white'
                : 'bg-dark-tertiary text-text-secondary hover:bg-dark-secondary'
            }`}
          >
            {cat.emoji} {cat.name}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-error/20 text-error p-3 rounded-lg mb-3">
          {error}
        </div>
      )}

      {/* Selected GIF Preview */}
      {selectedGif && (
        <div className="mb-3">
          <p className="text-text-secondary text-sm mb-2">Selected:</p>
          <div className="relative inline-block">
            <img
              src={selectedGif}
              alt="Selected GIF"
              className="w-32 h-32 object-cover rounded-lg"
            />
            <button
              onClick={() => onSelect(null)}
              className="absolute -top-2 -right-2 bg-error text-white w-6 h-6 rounded-full text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* GIF Grid - more rows, fill available space, Safari compatible */}
      <div className="grid grid-cols-3 gap-1.5 flex-1 overflow-y-auto pr-1" style={{ minHeight: '35vh', maxHeight: '45vh' }}>
        <AnimatePresence>
          {gifs.map((gif) => (
            <motion.button
              key={gif.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => handleSelect(gif)}
              className={`rounded-lg overflow-hidden ${
                selectedGif === gif.url ? 'ring-2 ring-accent' : ''
              }`}
              style={{ height: '100px' }} /* Fixed height for Safari compatibility */
            >
              <img
                src={gif.preview || gif.url}
                alt={gif.title}
                className="w-full h-full object-cover"
                loading="lazy"
                style={{ display: 'block' }} /* Fix Safari image display */
              />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {/* Loading State */}
      {loading && gifs.length === 0 && (
        <div className="text-center py-8 text-text-secondary">
          Loading GIFs...
        </div>
      )}

      {/* Empty State */}
      {!loading && gifs.length === 0 && (
        <div className="text-center py-8 text-text-secondary">
          No GIFs found. Try a different search or 🎲 shuffle.
        </div>
      )}

      {/* Shuffle hint */}
      {!loading && gifs.length > 0 && (
        <button
          onClick={handleShuffle}
          className="w-full mt-2 py-2 text-sm text-text-muted hover:text-accent transition-colors"
        >
          🎲 Show me different GIFs
        </button>
      )}
    </div>
  )
}

// Clear seen GIFs (call when starting a new game)
export function clearGifHistory() {
  seenGifIds.clear()
}

export default GifSearch
