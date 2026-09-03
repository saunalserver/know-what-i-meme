import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import { useGame } from '../context/useGame'
import Avatar from '../components/Avatar'
import soundManager from '../utils/sounds'
import { getJoinUrl } from '../utils/joinUrl'
import { MAX_PLAYERS } from '../constants'

function HostLobby() {
  const { createRoom, gameState, isHost, error, clearError, startGame, isConnected } = useGame()
  const [qrCode, setQrCode] = useState('')
  const [rounds, setRounds] = useState(3)
  const [copied, setCopied] = useState(false)
  const prevPlayerCountRef = useRef(0)

  const players = gameState?.players || []
  const joinUrl = gameState?.code ? getJoinUrl(gameState.code) : ''
  const canStart = players.length >= 2

  // Create room on mount
  useEffect(() => {
    if (isConnected && !isHost) {
      createRoom()
    }
  }, [isConnected, isHost, createRoom])

  useEffect(() => {
    if (!joinUrl) return
    QRCode.toDataURL(joinUrl, { width: 300, margin: 2 })
      .then(setQrCode)
      .catch(console.error)
  }, [joinUrl])

  // Chime when someone new arrives
  useEffect(() => {
    if (players.length > prevPlayerCountRef.current && prevPlayerCountRef.current > 0) {
      soundManager.playerJoin()
    }
    prevPlayerCountRef.current = players.length
  }, [players.length])

  const handleStartGame = () => {
    if (!canStart) return
    soundManager.success()
    startGame(rounds)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard needs a secure context; the link is on screen regardless.
    }
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🎮</div>
          <p className="text-text-secondary text-xl">
            {isConnected ? 'Creating room...' : 'Connecting to server...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 bg-error text-white px-6 py-3 rounded-lg shadow-lg z-50"
          >
            {error}
            <button onClick={clearError} className="ml-4 opacity-70 hover:opacity-100">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center w-full max-w-3xl"
      >
        <h1 className="text-4xl font-bold text-white mb-8">Waiting for Players</h1>

        {/* Join instructions: code, QR and a copyable link side by side */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-10 mb-10">
          <div>
            <p className="text-text-secondary mb-2">Room Code</p>
            <div className="room-code text-7xl text-accent animate-glow rounded-lg p-4 bg-dark-secondary inline-block">
              {gameState.code}
            </div>
            <button
              onClick={handleCopyLink}
              className="mt-4 block mx-auto text-sm text-text-muted hover:text-accent transition-colors break-all max-w-xs"
              title="Copy the join link"
            >
              {copied ? '✓ Link copied!' : `🔗 ${joinUrl}`}
            </button>
          </div>

          {qrCode && (
            <div>
              <p className="text-text-secondary mb-2">Scan to join</p>
              <div className="bg-white p-4 rounded-xl inline-block">
                <img src={qrCode} alt={`QR code linking to ${joinUrl}`} className="w-48 h-48" />
              </div>
            </div>
          )}
        </div>

        <div className="mb-8">
          <p className="text-text-secondary mb-3">
            Players ({players.length}/{MAX_PLAYERS})
          </p>
          <div className="flex flex-wrap justify-center gap-3 max-w-md mx-auto min-h-[4.5rem]">
            <AnimatePresence>
              {players.map((player) => (
                <motion.div
                  key={player.id}
                  layout
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  className="flex flex-col items-center gap-1"
                >
                  <Avatar player={player} size="md" />
                  <span className="text-xs text-text-secondary max-w-[4rem] truncate text-center">
                    {player.name}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {players.length === 0 && (
              <p className="text-text-muted self-center">Nobody here yet…</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="round-count" className="text-text-secondary mr-3">Rounds:</label>
          <select
            id="round-count"
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="bg-dark-tertiary text-white rounded-lg px-4 py-2 border-2 border-dark-tertiary focus:border-accent outline-none"
          >
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} Round{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleStartGame}
          disabled={!canStart}
          className={`btn-success text-xl px-12 py-4 rounded-xl ${canStart ? '' : 'opacity-50 cursor-not-allowed'}`}
        >
          {canStart ? 'Start Game!' : 'Waiting for players...'}
        </button>

        {!canStart && (
          <p className="text-text-muted mt-3">Need at least 2 players to start</p>
        )}
      </motion.div>
    </div>
  )
}

export default HostLobby
