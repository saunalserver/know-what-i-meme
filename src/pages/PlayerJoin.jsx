import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGame } from '../context/GameContext'

function PlayerJoin() {
  const navigate = useNavigate()
  const { code: urlCode } = useParams()
  const { joinRoom, player, gameState, error, clearError, isConnected } = useGame()
  const [code, setCode] = useState(urlCode || '')
  const [name, setName] = useState('')

  // Pre-fill code from URL
  useEffect(() => {
    if (urlCode) {
      setCode(urlCode.toUpperCase())
    }
  }, [urlCode])

  // Navigate to game when joined
  useEffect(() => {
    if (player && gameState) {
      navigate(`/play/${gameState.code}`)
    }
  }, [player, gameState, navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (code.length === 4 && name.trim()) {
      joinRoom(code.toUpperCase(), name.trim(), null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-dark-primary via-dark-secondary to-dark-tertiary" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Error display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-error text-white px-6 py-3 rounded-lg shadow-lg z-50"
        >
          {error}
          <button onClick={clearError} className="ml-4 opacity-70 hover:opacity-100">
            ✕
          </button>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <h1 className="text-4xl font-bold text-white text-center mb-8">
          <span className="text-accent">Join</span> a Game
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Room Code */}
          <div>
            <label className="block text-text-secondary mb-2 text-lg">
              Room Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="ABCD"
              className="input text-center text-3xl tracking-widest font-bold"
              disabled={!!urlCode}
            />
          </div>

          {/* Player Name */}
          <div>
            <label className="block text-text-secondary mb-2 text-lg">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={15}
              placeholder="Enter your name"
              className="input text-lg"
              autoFocus={!urlCode}
            />
          </div>

          {/* Join Button */}
          <button
            type="submit"
            disabled={code.length !== 4 || !name.trim() || !isConnected}
            className={`btn-primary w-full text-xl py-4 ${
              code.length !== 4 || !name.trim() || !isConnected
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            {isConnected ? 'Join Game' : 'Connecting...'}
          </button>
        </form>

        <button
          onClick={() => navigate('/')}
          className="mt-6 w-full text-text-secondary hover:text-white transition-colors"
        >
          ← Back to Home
        </button>
      </motion.div>
    </div>
  )
}

export default PlayerJoin
