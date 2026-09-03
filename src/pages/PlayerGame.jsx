import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import GifSearch from '../components/player/GifSearch'
import Avatar from '../components/Avatar'
import Timer from '../components/Timer'
import soundManager from '../utils/sounds'

function PlayerGame() {
  const navigate = useNavigate()
  const {
    gameState,
    player,
    votePrompt,
    submitGif,
    castVote,
    error,
    clearError,
    timer,
    isConnected,
    leaveGame,
  } = useGame()
  // The pick is tagged with the round it belongs to, so a new round starts
  // clean without an effect resetting it after the fact.
  const [draft, setDraft] = useState({ round: null, gif: null })

  const phase = gameState?.phase
  const round = gameState?.currentRound
  const myPlayer = gameState?.players?.find((p) => p.id === player?.id)
  const myGif = myPlayer?.currentGif

  // Whatever this player last tapped this round, falling back to the
  // submission the server already has (which survives a reconnect).
  const selectedGif = draft.round === round ? draft.gif : (myPlayer?.hasSubmitted ? myGif : null)

  if (!gameState || !player) return null

  // The seat is gone (host reset the room, or we were dropped from the lobby).
  if (!myPlayer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <div className="text-6xl mb-4">👋</div>
        <h2 className="text-2xl font-bold text-white mb-2">You're not in this game</h2>
        <p className="text-text-secondary mb-6">The room was reset or the game moved on without you.</p>
        <button
          onClick={() => { leaveGame(); navigate('/join') }}
          className="btn-primary text-lg px-8 py-3"
        >
          Join a game
        </button>
      </div>
    )
  }

  const handlePromptVote = (index) => {
    soundManager.select()
    votePrompt(index)
  }

  const handleGifSelect = (gifUrl) => {
    soundManager.select()
    setDraft({ round, gif: gifUrl })
  }

  const handleSubmitGif = () => {
    if (!selectedGif) return
    soundManager.success()
    submitGif(selectedGif)
  }

  const handleVote = (targetId) => {
    if (targetId === player.id) return
    soundManager.voteReceived()
    castVote(targetId)
  }

  const myVote = gameState.votes?.[player.id]
  const order = gameState.presentationOrder?.length
    ? gameState.presentationOrder
    : gameState.players.map(p => p.id)

  return (
    <div className="min-h-screen bg-dark-primary flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <AnimatePresence>
        {!isConnected && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 right-0 bg-warning text-dark-primary text-center py-2 font-bold z-50 text-sm"
          >
            ⚠️ Reconnecting… your score is safe
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 bg-error text-white px-4 py-3 rounded-lg shadow-lg z-50 flex justify-between items-center gap-3"
          >
            <span>{error}</span>
            <button onClick={clearError} className="opacity-70 hover:opacity-100 shrink-0">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header: who you are, the round, and — new here — the same countdown
          the big screen shows, so phones aren't guessing how long is left. */}
      <header className="bg-dark-secondary rounded-xl p-3 mb-3 mx-4 mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar player={myPlayer} size="sm" className="w-10 h-10 text-base" />
          <div className="min-w-0">
            <p className="font-bold text-white truncate">{myPlayer.name}</p>
            <p className="text-sm text-text-secondary">{myPlayer.score} points</p>
          </div>
        </div>

        {timer ? (
          <Timer seconds={timer.seconds} total={timer.total} phase={timer.phase} compact />
        ) : (
          <div className="text-right">
            <p className="text-sm text-text-secondary">Round</p>
            <p className="text-white font-bold">
              {gameState.currentRound}/{gameState.totalRounds}
            </p>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col mx-4 pb-4">
        <AnimatePresence mode="wait">
          {/* PROMPT VOTE */}
          {phase === 'prompt_vote' && (
            <motion.div key="prompt-vote" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-xl font-bold text-white mb-4">Vote for a Prompt</h2>

              <div className="space-y-3">
                {gameState.currentPromptOptions.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handlePromptVote(index)}
                    className={`w-full text-left p-4 rounded-xl transition-all ${
                      myPlayer.promptVote === index
                        ? 'bg-accent text-white ring-2 ring-white/40'
                        : 'bg-dark-secondary hover:bg-dark-tertiary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{['1️⃣', '2️⃣', '3️⃣'][index]}</span>
                      <span className="text-lg flex-1">{prompt}</span>
                      {gameState.promptVoteCounts?.[index] > 0 && (
                        <span className="text-sm font-bold opacity-70 tabular-nums">
                          {gameState.promptVoteCounts[index]}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-center text-text-secondary mt-4">
                {myPlayer.promptVote !== null
                  ? '✓ Vote submitted! Tap again to change.'
                  : 'Tap to vote for your favourite prompt'}
              </p>
            </motion.div>
          )}

          {/* GIF SEARCH */}
          {phase === 'gif_search' && (
            <motion.div
              key="gif-search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1 pb-24"
            >
              <div className="bg-dark-secondary rounded-xl p-3 mb-2">
                <p className="text-lg font-bold text-white">&ldquo;{gameState.currentPrompt}&rdquo;</p>
              </div>

              <div className="flex-1">
                <GifSearch onSelect={handleGifSelect} selectedGif={selectedGif} />
              </div>

              <div
                className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-dark-primary via-dark-primary to-transparent pt-8"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
              >
                {myPlayer.hasSubmitted ? (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    {selectedGif && selectedGif !== myPlayer.currentGif ? (
                      <button
                        onClick={handleSubmitGif}
                        className="w-full bg-warning hover:bg-warning/80 text-dark-primary font-bold text-lg py-4 rounded-xl transition-colors"
                      >
                        🔄 Update to this GIF
                      </button>
                    ) : (
                      <div className="bg-success/20 border border-success/40 rounded-xl p-3 text-center">
                        <p className="text-success font-bold">✓ GIF submitted — you can still change it</p>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  selectedGif && (
                    <motion.button
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={handleSubmitGif}
                      className="w-full btn-success text-lg py-4"
                    >
                      ✓ Submit GIF
                    </motion.button>
                  )
                )}
              </div>
            </motion.div>
          )}

          {/* PRESENTATION */}
          {phase === 'presentation' && (
            <motion.div key="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
              <div className="text-6xl mb-4">👀</div>
              <h2 className="text-2xl font-bold text-white mb-2">Watch the Big Screen!</h2>
              <p className="text-text-secondary">
                Meme {Math.min(gameState.presentationIndex + 1, order.length)} of {order.length}
              </p>
            </motion.div>
          )}

          {/* VOTING */}
          {phase === 'voting' && (
            <motion.div key="voting" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-xl font-bold text-white mb-2">Vote for the Best Meme!</h2>
              <p className="text-text-secondary mb-1">&ldquo;{gameState.currentPrompt}&rdquo;</p>
              <p className="text-text-muted text-sm mb-4">Memes stay anonymous until voting ends</p>

              <div className="grid grid-cols-2 gap-3">
                {order.map((playerId, index) => {
                  const p = gameState.players.find(pl => pl.id === playerId)
                  if (!p || p.id === player.id) return null // Can't vote for yourself
                  const isSelected = myVote === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleVote(p.id)}
                      className={`rounded-xl overflow-hidden transition-all ${
                        isSelected ? 'ring-4 ring-accent ring-offset-2 ring-offset-dark-primary' : 'active:scale-95'
                      }`}
                    >
                      <div className="relative">
                        <img src={p.currentGif} alt={`Meme ${index + 1}`} className="w-full h-32 object-cover" />
                        <div className="absolute top-2 left-2 bg-dark-primary/80 px-2 py-1 rounded text-sm font-bold">
                          #{index + 1}
                        </div>
                        {isSelected && (
                          <div className="absolute inset-0 bg-accent/30 flex items-center justify-center">
                            <span className="text-4xl">✓</span>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              <p className="text-center text-text-secondary mt-4">
                {myPlayer.hasVoted ? '✓ Vote submitted! Tap another to change.' : 'Tap to vote for the best meme'}
              </p>
            </motion.div>
          )}

          {/* ROUND RESULTS */}
          {phase === 'round_results' && (
            <motion.div key="round-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-2">Round Complete!</h2>
              <p className="text-text-secondary">Check the big screen for results</p>

              <div className="mt-6 bg-dark-secondary rounded-xl p-4">
                <p className="text-sm text-text-secondary">Your Score</p>
                <p className="text-4xl font-bold text-accent">{myPlayer.score}</p>
              </div>
            </motion.div>
          )}

          {/* LEADERBOARD */}
          {phase === 'leaderboard' && (
            <motion.div key="leaderboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-6">
              <h2 className="text-2xl font-bold text-white mb-1 text-center">📊 Standings</h2>
              <p className="text-text-secondary text-center mb-6">
                Round {gameState.currentRound} of {gameState.totalRounds}
              </p>

              <div className="space-y-2">
                {[...gameState.players].sort((a, b) => b.score - a.score).map((p, index) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      p.id === player.id ? 'bg-accent/20 ring-2 ring-accent' : 'bg-dark-secondary'
                    }`}
                  >
                    <span className="text-lg font-bold w-6">
                      {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </span>
                    <Avatar player={p} size="sm" />
                    <span className={`flex-1 font-medium ${p.id === player.id ? 'text-white' : 'text-text-secondary'}`}>
                      {p.name} {p.id === player.id && '(You)'}
                    </span>
                    <span className="font-bold text-accent">{p.score}</span>
                  </motion.div>
                ))}
              </div>

              <p className="text-center text-text-secondary mt-6">Watch the big screen to continue...</p>
            </motion.div>
          )}

          {/* FINAL RESULTS */}
          {phase === 'final_results' && (
            <motion.div key="final-results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-2xl font-bold text-white mb-4">Game Over!</h2>

              <div className="bg-dark-secondary rounded-xl p-6 mb-4">
                <p className="text-text-secondary mb-2">Final Score</p>
                <p className="text-5xl font-bold text-accent">{myPlayer.score}</p>
                <p className="text-text-secondary mt-1">points</p>
              </div>

              <p className="text-text-secondary">Check the big screen for the winner!</p>

              <div className="mt-6 p-4 bg-dark-secondary rounded-xl">
                <p className="text-text-secondary text-sm">Waiting for the host to start a new game...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default PlayerGame
