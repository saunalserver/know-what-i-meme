import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGame } from '../context/useGame'
import CameraModal from '../components/CameraModal'

const PREVIEW_COLOR = '#7289da'

function PlayerJoin() {
  const navigate = useNavigate()
  const { code: urlCode } = useParams()
  const { joinRoom, player, gameState, error, clearError, isConnected } = useGame()
  const [code, setCode] = useState((urlCode || '').toUpperCase())
  const [name, setName] = useState('')
  const [photo, setPhoto] = useState(null)
  const [isJoining, setIsJoining] = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  // Rejoining an existing session is handled centrally in GameContext, which
  // fires as soon as the socket connects.

  // Navigate to game when joined
  useEffect(() => {
    if (player && gameState) {
      navigate(`/play/${gameState.code}`)
    }
  }, [player, gameState, navigate])

  // A rejected join frees the button again -- derived rather than reset in an
  // effect, so there is no render where the spinner and the error both show.
  const joining = isJoining && !error

  const canSubmit = useMemo(
    () => code.length === 4 && name.trim().length > 0 && isConnected && !joining,
    [code, name, isConnected, joining]
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setIsJoining(true)
    clearError()
    joinRoom(code.toUpperCase(), name.trim(), photo)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-dark-primary via-dark-secondary to-dark-tertiary"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 bg-error text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center justify-between gap-4"
        >
          <span>{error}</span>
          <button onClick={clearError} className="opacity-70 hover:opacity-100 shrink-0">
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
          <div>
            <label htmlFor="room-code" className="block text-text-secondary mb-2 text-lg">
              Room Code
            </label>
            <input
              id="room-code"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              maxLength={4}
              placeholder="ABCD"
              className="input text-center text-3xl tracking-widest font-bold"
              disabled={!!urlCode}
              autoFocus={!urlCode}
            />
          </div>

          <div>
            <label htmlFor="player-name" className="block text-text-secondary mb-2 text-lg">
              Your Name
            </label>
            <input
              id="player-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={15}
              placeholder="Enter your name"
              className="input text-lg"
              autoFocus={!!urlCode}
            />
          </div>

          <div>
            <span className="block text-text-secondary mb-2 text-lg">
              Profile Picture <span className="text-text-muted text-sm">(optional)</span>
            </span>

            <div className="flex gap-3 items-start">
              <div className="relative">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden border-2 border-dark-tertiary"
                  style={{
                    backgroundColor: PREVIEW_COLOR,
                    backgroundImage: photo ? `url(${photo})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {!photo && name.charAt(0).toUpperCase()}
                </div>
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Remove photo"
                    className="absolute -top-1 -right-1 w-6 h-6 bg-error rounded-full flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="w-full btn-secondary py-3 flex items-center justify-center gap-2"
                >
                  📷 Take Photo
                </button>
                <p className="text-text-muted text-xs mt-2 text-center">
                  {photo ? 'Photo captured! Tap ✕ to remove.' : 'Tap to take a selfie'}
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`btn-primary w-full text-xl py-4 flex items-center justify-center gap-2 ${
              !canSubmit ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {joining ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                Joining...
              </>
            ) : !isConnected ? (
              'Connecting...'
            ) : (
              'Join Game'
            )}
          </button>
        </form>

        <button
          onClick={() => navigate('/')}
          className="mt-6 w-full text-text-secondary hover:text-white transition-colors"
        >
          ← Back to Home
        </button>
      </motion.div>

      <CameraModal
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={setPhoto}
      />
    </div>
  )
}

export default PlayerJoin
