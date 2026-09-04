import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import { useGame } from '../context/useGame'
import Avatar from '../components/Avatar'
import soundManager from '../utils/sounds'
import { getJoinUrl, getJoinBaseUrl } from '../utils/joinUrl'
import { MAX_PLAYERS, MIN_PLAYERS, MAX_ROUNDS } from '../constants'

const ROUND_PRESETS = [1, 3, 5, 8, 12, MAX_ROUNDS]

function HostLobby() {
  const { createRoom, gameState, isHost, error, clearError, startGame, isConnected } = useGame()
  const [qrCode, setQrCode] = useState('')
  const [rounds, setRounds] = useState(3)
  const [copied, setCopied] = useState(false)
  const prevPlayerCountRef = useRef(0)

  const players = gameState?.players || []
  const joinUrl = gameState?.code ? getJoinUrl(gameState.code) : ''
  // What a player types by hand — the code goes in the field on the page, so
  // the address they need is the bare one, without the code stuck on the end.
  const typedUrl = getJoinBaseUrl().replace(/^https?:\/\//, '')
  const canStart = players.length >= MIN_PLAYERS

  // Create room on mount
  useEffect(() => {
    if (isConnected && !isHost) {
      createRoom()
    }
  }, [isConnected, isHost, createRoom])

  useEffect(() => {
    if (!joinUrl) return
    // Rendered large: this is scanned from across the room, often off a TV that
    // is softening the image, so the QR needs the pixels.
    QRCode.toDataURL(joinUrl, { width: 600, margin: 1 })
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
          <div className="animate-spin text-6xl mb-6">🎮</div>
          <p className="text-text-secondary text-tv-lg">
            {isConnected ? 'Creating room…' : 'Connecting to server…'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col tv-safe py-[clamp(1.5rem,3vh,3rem)]">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 bg-error text-white px-6 py-3 rounded-xl shadow-lg z-50 flex items-center gap-4"
          >
            {error}
            <button onClick={clearError} className="opacity-70 hover:opacity-100">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wordmark. The room should be able to tell what is on the TV before
          anyone explains it. */}
      <header className="flex items-baseline justify-between gap-6 shrink-0">
        <h1 className="text-tv-label font-extrabold tracking-[0.2em] text-text-muted uppercase">
          Know What I Meme
        </h1>
        <p className="text-tv-label text-text-muted tabular-nums">
          {players.length}/{MAX_PLAYERS} joined
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 flex flex-col justify-center gap-[clamp(1.5rem,3.5vh,3rem)] min-h-0 py-[clamp(1rem,2vh,2rem)]"
      >
        {/* Join instructions. The two panels are stretched to a shared height
            and each opens with its step label in the same place, so the "Go to"
            and "Or scan" lines sit on one baseline instead of drifting apart. */}
        <div className="grid gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[1.35fr_1fr] items-stretch">
          <div className="card flex flex-col justify-center gap-[clamp(0.75rem,1.6vh,1.5rem)] !p-[clamp(1.25rem,2.5vw,2.5rem)]">
            <div>
              <p className="text-tv-label text-text-secondary uppercase tracking-widest mb-2">
                <span className="text-accent font-bold">1.</span> Go to
              </p>
              <button
                onClick={handleCopyLink}
                title="Copy the join link"
                className="text-tv-lg font-bold text-white hover:text-accent transition-colors break-all text-left"
              >
                {copied ? '✓ Link copied!' : typedUrl}
              </button>
            </div>

            <div className="h-px bg-line" />

            <div>
              <p className="text-tv-label text-text-secondary uppercase tracking-widest mb-1">
                <span className="text-accent font-bold">2.</span> Enter the code
              </p>
              <p className="room-code text-tv-3xl text-accent leading-none">{gameState.code}</p>
            </div>
          </div>

          {qrCode && (
            <div className="card flex flex-col justify-center items-center gap-[clamp(0.75rem,1.6vh,1.5rem)] !p-[clamp(1.25rem,2.5vw,2.5rem)]">
              <p className="text-tv-label text-text-secondary uppercase tracking-widest">
                Or scan
              </p>
              <div className="bg-white rounded-2xl p-[clamp(0.5rem,1vw,1rem)] animate-glow">
                <img
                  src={qrCode}
                  alt={`QR code linking to ${joinUrl}`}
                  className="block w-[clamp(9rem,23vh,22rem)] h-[clamp(9rem,23vh,22rem)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Who's in. Empty slots are drawn so the row keeps its shape from the
            first player to the last and nothing below it jumps as people join. */}
        <div>
          <p className="text-tv-label text-text-secondary uppercase tracking-widest mb-[clamp(0.5rem,1.5vh,1.25rem)]">
            Players
          </p>
          <div className="flex flex-wrap gap-[clamp(0.75rem,1.5vw,1.75rem)]">
            <AnimatePresence mode="popLayout">
              {players.map((player) => (
                <motion.div
                  key={player.id}
                  layout
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="flex flex-col items-center gap-2 w-[clamp(4rem,7vw,8rem)]"
                >
                  <Avatar
                    player={player}
                    size={null}
                    className="w-[clamp(3rem,5.2vw,6rem)] h-[clamp(3rem,5.2vw,6rem)] text-tv-lg"
                  />
                  <span className="text-tv-label text-text-secondary max-w-full truncate">
                    {player.name}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>

            {Array.from({ length: Math.max(0, MIN_PLAYERS - players.length) }).map((_, i) => (
              <div key={`slot-${i}`} className="flex flex-col items-center gap-2 w-[clamp(4rem,7vw,8rem)]">
                <div className="w-[clamp(3rem,5.2vw,6rem)] h-[clamp(3rem,5.2vw,6rem)] rounded-full border-2 border-dashed border-line" />
                <span className="text-tv-label text-text-muted">waiting</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Controls pinned to the bottom of the screen, on one baseline. */}
      <footer className="shrink-0 flex flex-wrap items-center justify-between gap-[clamp(1rem,2vw,2rem)] pt-[clamp(1rem,2vh,2rem)] border-t border-line">
        <div className="flex items-center gap-3">
          <span className="text-tv-label text-text-secondary uppercase tracking-widest">Rounds</span>
          <div className="flex gap-2" role="group" aria-label="Number of rounds">
            {ROUND_PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setRounds(n)}
                aria-pressed={rounds === n}
                className={`min-w-[clamp(2.75rem,4vw,4.5rem)] rounded-xl px-3 py-2 text-tv-body font-bold tabular-nums transition-colors ${
                  rounds === n
                    ? 'bg-accent text-white'
                    : 'bg-dark-elevated text-text-secondary hover:bg-dark-tertiary border border-line'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-5">
          {!canStart && (
            <p className="text-tv-label text-text-muted">
              Need {MIN_PLAYERS - players.length} more player
              {MIN_PLAYERS - players.length === 1 ? '' : 's'}
            </p>
          )}
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className={`btn-success text-tv-lg px-[clamp(1.5rem,3vw,4rem)] py-[clamp(0.6rem,1.4vh,1.25rem)] ${
              canStart ? '' : 'opacity-40 cursor-not-allowed'
            }`}
          >
            Start Game →
          </button>
        </div>
      </footer>
    </div>
  )
}

export default HostLobby
