import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Always use current hostname for API calls (works on Tailscale/LAN)
const getApiUrl = () => {
  const protocol = window.location.protocol
  const hostname = window.location.hostname
  return `${protocol}//${hostname}:3002`
}

const API_URL = getApiUrl()

export function GifSearch({ onSelect, selectedGif }) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load trending GIFs on mount
  useEffect(() => {
    fetchTrending()
  }, [])

  const fetchTrending = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/gif/trending?limit=20`)
      if (!res.ok) throw new Error('Failed to fetch trending')
      const data = await res.json()
      setGifs(data)
    } catch (err) {
      setError('Failed to load GIFs (API key needed)')
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
    try {
      const res = await fetch(`${API_URL}/api/gif/search?q=${encodeURIComponent(searchQuery)}&limit=20`)
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

  return (
    <div className="w-full">
      {/* Search Input */}
      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs..."
          className="input pr-10"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
          {loading ? '⏳' : '🔍'}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-error/20 text-error p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Selected GIF Preview */}
      {selectedGif && (
        <div className="mb-4">
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

      {/* GIF Grid */}
      <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-2">
        <AnimatePresence>
          {gifs.map((gif) => (
            <motion.button
              key={gif.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => onSelect(gif.url)}
              className={`gif-item aspect-square rounded-lg overflow-hidden ${
                selectedGif === gif.url ? 'ring-2 ring-accent' : ''
              }`}
            >
              <img
                src={gif.preview || gif.url}
                alt={gif.title}
                className="w-full h-full object-cover"
                loading="lazy"
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
          No GIFs found. Try a different search.
        </div>
      )}
    </div>
  )
}

export default GifSearch
