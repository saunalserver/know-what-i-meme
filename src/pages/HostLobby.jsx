import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import QRCode from 'qrcode'
import { useGame } from '../context/GameContext'

function HostLobby() {
  const { createRoom, gameState, isHost, error, clearError, startGame, isConnected } = useGame()
  const [qrCode, setQrCode] = useState('')
  const [rounds, setRounds] = useState(3)

  // Create room on mount
  useEffect(() => {
    if (isConnected && !isHost) {
      createRoom()
    }
  }, [isConnected, isHost, createRoom])

  // Generate QR code when room code is available
  useEffect(() => {
    if (gameState?.code) {
      const joinUrl = `${window.location.origin}/join/${gameState.code}`
      QRCode.toDataURL(joinUrl, { width: 300, margin: 2 })
        .then(setQrCode)
        .catch(console.error)
    }
  }, [gameState?.code])

  const handleStartGame = () => {
    if (gameState?.players?.length >= 2) {
      startGame(rounds)
    }
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🎮</div>
          <p className="text-text-secondary text-xl">Creating room...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
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
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        {/* Title */}
        <h1 className="text-4xl font-bold text-white mb-8">
          Waiting for Players
        </h1>

        {/* Room Code */}
        <div className="mb-8">
          <p className="text-text-secondary mb-2">Room Code:</p>
          <div className="room-code text-7xl text-accent animate-glow rounded-lg p-4 bg-dark-secondary inline-block">
            {gameState.code}
          </div>
        </div>

        {/* QR Code */}
        {qrCode && (
          <div className="mb-8">
            <p className="text-text-secondary mb-2">Scan to join:</p>
            <div className="bg-white p-4 rounded-xl inline-block">
              <img src={qrCode} alt="QR Code" className="w-48 h-48" />
            </div>
          </div>
        )}

        {/* Players List */}
        <div className="mb-8">
          <p className="text-text-secondary mb-3">
            Players ({gameState.players?.length || 0}/9):
          </p>
          <div className="flex flex-wrap justify-center gap-3 max-w-md mx-auto">
            {gameState.players?.map((player) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                className="player-avatar"
                style={{ backgroundColor: player.color }}
              >
                {player.name.charAt(0).toUpperCase()}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Round Selection */}
        <div className="mb-6">
          <label className="text-text-secondary mr-3">Rounds:</label>
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="bg-dark-tertiary text-white rounded-lg px-4 py-2 border-2 border-dark-tertiary focus:border-accent outline-none"
          >
            <option value={3}>3 Rounds</option>
            <option value={5}>5 Rounds</option>
            <option value={7}>7 Rounds</option>
          </select>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartGame}
          disabled={(gameState.players?.length || 0) < 2}
          className={`btn-success text-xl px-12 py-4 rounded-xl ${
            (gameState.players?.length || 0) < 2 ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {(gameState.players?.length || 0) < 2
            ? 'Waiting for players...'
            : 'Start Game!'}
        </button>

        {(gameState.players?.length || 0) < 2 && (
          <p className="text-text-muted mt-3">Need at least 2 players to start</p>
        )}
      </motion.div>
    </div>
  )
}

export default HostLobby
