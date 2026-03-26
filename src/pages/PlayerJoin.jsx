import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGame } from '../context/GameContext'
import CameraModal from '../components/CameraModal'

// LocalStorage key for session (must match GameContext)
const STORAGE_KEY = 'kwim_player_session'

// Load player session from localStorage
const loadPlayerSession = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return null
    const session = JSON.parse(data)
    // Only restore sessions from the last 30 minutes
    if (Date.now() - session.timestamp > 30 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session
  } catch (e) {
    return null
  }
}

function PlayerJoin() {
  const navigate = useNavigate()
  const { code: urlCode } = useParams()
  const { joinRoom, rejoinRoom, player, gameState, error, clearError, isConnected } = useGame()
  const [code, setCode] = useState(urlCode || '')
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoPreview, setPhotoPreview] = useState(null)
  const [isJoining, setIsJoining] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [rejoinAttempted, setRejoinAttempted] = useState(false)

  // Auto-rejoin on mount if session exists
  useEffect(() => {
    if (!isConnected || rejoinAttempted) return

    const session = loadPlayerSession()
    if (session && session.code) {
      console.log('🔄 Found saved session, attempting rejoin:', session.code)
      setRejoinAttempted(true)
      setIsJoining(true)
      rejoinRoom(session.code, session.playerId)
    } else {
      setRejoinAttempted(true)
    }
  }, [isConnected, rejoinAttempted, rejoinRoom])

  // Pre-fill code from URL
  useEffect(() => {
    if (urlCode) {
      setCode(urlCode.toUpperCase())
    }
  }, [urlCode])

  // Update photo preview when URL changes
  useEffect(() => {
    if (photoUrl.trim()) {
      // Validate it's a URL-like string
      if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://') || photoUrl.startsWith('data:')) {
        setPhotoPreview(photoUrl)
      } else {
        setPhotoPreview(null)
      }
    } else {
      setPhotoPreview(null)
    }
  }, [photoUrl])

  // Navigate to game when joined
  useEffect(() => {
    if (player && gameState) {
      setIsJoining(false)
      navigate(`/play/${gameState.code}`)
    }
  }, [player, gameState, navigate])

  // Clear joining state on error
  useEffect(() => {
    if (error) {
      setIsJoining(false)
      // Clear the saved session on error so user can try fresh
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch (e) {}
    }
  }, [error])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (code.length === 4 && name.trim() && isConnected && !isJoining) {
      setIsJoining(true)
      // Use photoUrl which may contain a URL or a data URL from camera
      const photo = photoUrl.trim() || null
      joinRoom(code.toUpperCase(), name.trim(), photo)
    }
  }

  const handleCameraCapture = (dataUrl) => {
    setPhotoUrl(dataUrl)
    setPhotoPreview(dataUrl)
  }

  const handleClearPhoto = () => {
    setPhotoUrl('')
    setPhotoPreview(null)
  }

  // Generate a random color for the preview avatar
  const previewColor = '#7289da'

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

          {/* Profile Picture (optional) */}
          <div>
            <label className="block text-text-secondary mb-2 text-lg">
              Profile Picture <span className="text-text-muted text-sm">(optional)</span>
            </label>

            {/* Avatar Preview with buttons */}
            <div className="flex gap-3 items-start">
              {/* Avatar Preview */}
              <div className="relative">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden border-2 border-dark-tertiary"
                  style={{
                    backgroundColor: previewColor,
                    backgroundImage: photoPreview ? `url(${photoPreview})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  {!photoPreview && name.charAt(0).toUpperCase()}
                </div>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={handleClearPhoto}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-error rounded-full flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Camera button only */}
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="w-full btn-secondary py-3 flex items-center justify-center gap-2"
                >
                  📷 Take Photo
                </button>
                <p className="text-text-muted text-xs mt-2 text-center">
                  {photoPreview ? 'Photo captured! Tap X to remove.' : 'Tap to take a selfie'}
                </p>
              </div>
            </div>
          </div>

          {/* Join Button */}
          <button
            type="submit"
            disabled={code.length !== 4 || !name.trim() || !isConnected || isJoining}
            className={`btn-primary w-full text-xl py-4 flex items-center justify-center gap-2 ${
              code.length !== 4 || !name.trim() || !isConnected || isJoining
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            {isJoining ? (
              <>
                <motion.div
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

      {/* Camera Modal */}
      <CameraModal
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />
    </div>
  )
}

export default PlayerJoin
