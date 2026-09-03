import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/useGame'
import Timer from '../components/Timer'
import Avatar from '../components/Avatar'
import soundManager from '../utils/sounds'
import musicManager from '../utils/music'

// Sound played when the game moves into each phase.
const PHASE_SOUNDS = {
  presentation: 'whoosh',
  round_results: 'roundComplete',
  final_results: 'celebration',
  prompt_vote: 'whoosh',
  gif_search: 'whoosh',
  voting: 'whoosh',
}

function HostGame() {
  const { gameState, advancePresentation, nextRound, roundResults, timer, resetGame, restartGame } = useGame()
  const prevPhaseRef = useRef(null)
  const [musicEnabled, setMusicEnabled] = useState(true)

  const phase = gameState?.phase

  // Ambient background music per phase
  useEffect(() => {
    if (phase && musicEnabled) {
      musicManager.play(phase)
    } else {
      musicManager.stop()
    }
  }, [phase, musicEnabled])

  // Stop the music for good when leaving the big screen.
  useEffect(() => () => musicManager.stop(), [])

  // Phase transition sounds
  useEffect(() => {
    if (prevPhaseRef.current && prevPhaseRef.current !== phase) {
      const sound = PHASE_SOUNDS[phase]
      if (sound) soundManager[sound]?.()
    }
    prevPhaseRef.current = phase
  }, [phase])

  if (!gameState) return null

  const players = gameState.players || []
  const order = gameState.presentationOrder?.length
    ? gameState.presentationOrder
    : players.map(p => p.id)
  const memeCount = order.length

  const currentMemePlayer = players.find(p => p.id === order[gameState.presentationIndex])
  const ranked = [...players].sort((a, b) => b.score - a.score)

  const toggleMusic = () => {
    const next = !musicEnabled
    setMusicEnabled(next)
    musicManager.setEnabled(next)
  }

  return (
    <div className="min-h-screen bg-dark-primary flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <header className="bg-dark-secondary px-4 py-3 flex justify-between items-center gap-4 sticky top-0 z-40">
        <div className="text-text-secondary shrink-0">
          Room: <span className="text-accent font-bold">{gameState.code}</span>
        </div>

        {/* The countdown sits in the header rather than floating over the
            content, so nothing has to be nudged out of its way. */}
        <div className="flex-1 flex justify-center min-h-[3rem] items-center">
          {timer && <Timer seconds={timer.seconds} total={timer.total} phase={timer.phase} compact />}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={toggleMusic}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              musicEnabled
                ? 'bg-accent/20 hover:bg-accent/40 text-accent'
                : 'bg-dark-tertiary hover:bg-dark-tertiary/80 text-text-secondary'
            }`}
            title={musicEnabled ? 'Mute music' : 'Enable music'}
          >
            {musicEnabled ? '🎵' : '🔇'}
          </button>
          <div className="text-text-secondary whitespace-nowrap">
            Round {gameState.currentRound} / {gameState.totalRounds}
          </div>
          {phase !== 'lobby' && phase !== 'final_results' && (
            <button
              onClick={resetGame}
              className="px-3 py-1 text-sm bg-error/20 hover:bg-error/40 text-error rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {/* LOBBY */}
          {phase === 'lobby' && (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <h1 className="text-4xl font-bold text-white mb-4">Starting Soon...</h1>
              <div className="flex flex-wrap justify-center gap-4">
                {players.map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1">
                    <Avatar player={p} size="lg" className="text-xl" />
                    <span className="text-sm text-text-secondary">{p.name}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* PROMPT VOTE */}
          {phase === 'prompt_vote' && (
            <motion.div key="prompt-vote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center w-full max-w-4xl">
              <h2 className="text-3xl text-text-secondary mb-8">Players are voting on a prompt...</h2>

              {/* The options are on screen too, so the room can read along */}
              <div className="space-y-3 mb-10 text-left max-w-2xl mx-auto">
                {(gameState.currentPromptOptions || []).map((prompt, index) => (
                  <div key={index} className="bg-dark-secondary rounded-xl px-5 py-4 flex items-center gap-4">
                    <span className="text-2xl shrink-0">{['1️⃣', '2️⃣', '3️⃣'][index]}</span>
                    <span className="text-xl text-white flex-1">{prompt}</span>
                    <span className="text-accent font-bold tabular-nums shrink-0">
                      {gameState.promptVoteCounts?.[index] || 0}
                    </span>
                  </div>
                ))}
              </div>

              <PlayerStatusRow players={players} isReady={p => p.promptVote !== null} />
            </motion.div>
          )}

          {/* GIF SEARCH */}
          {phase === 'gif_search' && (
            <motion.div key="gif-search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center w-full max-w-4xl">
              {gameState.isFinalRound && <FinalRoundBanner />}
              <h2 className="text-2xl text-text-secondary mb-4">Prompt:</h2>
              <div className="bg-dark-secondary rounded-xl p-8 mb-8">
                <p className="text-4xl text-white font-bold">&ldquo;{gameState.currentPrompt}&rdquo;</p>
              </div>
              <p className="text-xl text-text-secondary mb-4">Players are searching for GIFs...</p>
              <PlayerStatusRow players={players} isReady={p => p.hasSubmitted} />
            </motion.div>
          )}

          {/* PRESENTATION */}
          {phase === 'presentation' && currentMemePlayer && (
            <motion.div
              key="presentation"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center w-full h-full flex flex-col items-center justify-center"
            >
              <div className="mb-4 text-3xl text-text-secondary font-bold">
                Meme #{gameState.presentationIndex + 1}
                <span className="text-text-muted text-xl font-normal"> of {memeCount}</span>
              </div>

              <div className="bg-dark-secondary rounded-xl p-6 mb-6 max-w-3xl mx-auto">
                <p className="text-3xl text-white font-bold">&ldquo;{gameState.currentPrompt}&rdquo;</p>
              </div>

              {currentMemePlayer.currentGif && (
                <div className="flex-1 flex items-center justify-center w-full max-w-5xl mx-auto">
                  <motion.img
                    key={currentMemePlayer.currentGif}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25 }}
                    src={currentMemePlayer.currentGif}
                    alt="Submitted meme"
                    className="max-w-full max-h-[65vh] object-contain rounded-xl shadow-2xl"
                  />
                </div>
              )}

              <button onClick={advancePresentation} className="btn-primary mt-8 text-xl px-8 py-4">
                {gameState.presentationIndex < memeCount - 1 ? 'Next Meme →' : 'Start Voting'}
              </button>
            </motion.div>
          )}

          {/* VOTING */}
          {phase === 'voting' && (
            <motion.div key="voting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center w-full max-w-5xl">
              <h2 className="text-4xl text-white font-bold mb-2">&ldquo;{gameState.currentPrompt}&rdquo;</h2>
              <p className="text-xl text-text-secondary mb-6">Vote for your favourite on your phone!</p>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                {order.map((playerId, index) => {
                  const player = players.find(p => p.id === playerId)
                  if (!player) return null
                  return (
                    <div key={playerId} className="bg-dark-secondary rounded-xl overflow-hidden">
                      <img src={player.currentGif} alt={`Meme ${index + 1}`} className="w-full h-40 object-cover" />
                      <div className="p-2 text-center">
                        <span className="text-lg font-bold text-text-secondary">Meme #{index + 1}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-text-muted text-sm mb-4">
                {players.filter(p => p.hasVoted).length} / {players.filter(p => p.connected !== false).length} votes cast
              </p>
              <PlayerStatusRow players={players} isReady={p => p.hasVoted} size="md" />
            </motion.div>
          )}

          {/* ROUND RESULTS */}
          {phase === 'round_results' && roundResults && (
            <motion.div key="round-results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="text-center w-full max-w-4xl">
              {gameState.isFinalRound && <FinalRoundBanner small />}
              <h2 className="text-4xl text-white font-bold mb-8">Round {gameState.currentRound} Results!</h2>

              <div className="space-y-4 mb-8">
                {roundResults.map((result, index) => (
                  <motion.div
                    key={result.playerId}
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.2 }}
                    className={`card ${index === 0 && result.votesReceived > 0 ? 'ring-2 ring-success' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-bold text-accent w-12">#{index + 1}</div>
                      <img src={result.gifUrl} alt="" className="w-24 h-24 object-cover rounded-lg" />
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar player={{ photo: result.playerPhoto, color: result.playerColor, name: result.playerName }} size="sm" />
                          <p className="text-xl font-bold text-white">{result.playerName}</p>
                        </div>
                        <p className="text-success text-lg">
                          +{result.pointsEarned} pts
                          {result.multiplier > 1 && (
                            <span className="text-yellow-400 ml-2">({result.votesReceived} × {result.multiplier})</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {result.voters?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dark-tertiary text-left">
                        <p className="text-text-muted text-sm mb-2">Voted by:</p>
                        <div className="flex flex-wrap gap-2">
                          {result.voters.map((voter) => (
                            <div key={voter.voterId} className="flex items-center gap-1 bg-dark-tertiary rounded-full px-2 py-1">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ backgroundColor: voter.voterColor }}
                              >
                                {voter.voterName.charAt(0)}
                              </div>
                              <span className="text-sm text-text-secondary">{voter.voterName}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              <button onClick={nextRound} className="btn-success text-xl px-12 py-4">
                {gameState.currentRound >= gameState.totalRounds ? 'See Final Results' : 'Next Round →'}
              </button>
            </motion.div>
          )}

          {/* LEADERBOARD */}
          {phase === 'leaderboard' && (
            <motion.div key="leaderboard" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center w-full max-w-4xl">
              <h2 className="text-4xl text-white font-bold mb-2">📊 Leaderboard</h2>
              <p className="text-text-secondary mb-8">
                After Round {gameState.currentRound} of {gameState.totalRounds}
              </p>

              <div className="space-y-3 mb-8">
                {ranked.map((player, index) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.15 }}
                    className={`flex items-center gap-4 p-4 rounded-xl ${
                      index === 0
                        ? 'bg-gradient-to-r from-yellow-500/20 to-transparent ring-2 ring-yellow-500'
                        : 'bg-dark-secondary'
                    }`}
                  >
                    <div className="text-3xl font-bold w-12">{medal(index)}</div>
                    <Avatar player={player} size="md" />
                    <div className="flex-1 text-left">
                      <p className="text-xl font-bold text-white">{player.name}</p>
                    </div>
                    <div className="text-2xl font-bold text-accent">{player.score} pts</div>
                  </motion.div>
                ))}
              </div>

              <button onClick={nextRound} className="btn-success text-xl px-12 py-4">
                Continue to Round {gameState.currentRound + 1} →
              </button>
            </motion.div>
          )}

          {/* FINAL RESULTS */}
          {phase === 'final_results' && (
            <motion.div key="final-results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center w-full max-w-4xl">
              <h2 className="text-5xl text-white font-bold mb-4">🏆 Winner! 🏆</h2>

              {ranked.length === 0 ? (
                <p className="text-text-secondary text-xl mb-8">Everyone left before the end!</p>
              ) : (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="flex flex-col items-center mb-8"
                  >
                    <Avatar player={ranked[0]} size="2xl" className="mb-4" />
                    <h3 className="text-4xl text-white font-bold">{ranked[0].name}</h3>
                    <p className="text-2xl text-success mt-2">{ranked[0].score} points</p>
                  </motion.div>

                  {ranked.length > 1 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                      {ranked.slice(1).map((player) => (
                        <div key={player.id} className="card">
                          <Avatar player={player} size="md" className="mx-auto mb-2" />
                          <p className="font-bold">{player.name}</p>
                          <p className="text-text-secondary">{player.score} pts</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-4 items-center">
                <div className="flex flex-wrap gap-4 justify-center">
                  <button onClick={() => restartGame(gameState.totalRounds)} className="btn-success text-xl px-8 py-4">
                    🔄 Play Again ({gameState.totalRounds} rounds)
                  </button>
                  <button onClick={resetGame} className="btn-primary text-xl px-8 py-4">
                    🏠 Back to Lobby
                  </button>
                </div>
                <p className="text-text-secondary text-sm mt-2">Same players, fresh start!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

function medal(index) {
  return index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`
}

function FinalRoundBanner({ small = false }) {
  return (
    <motion.div initial={{ scale: 0, rotate: small ? 0 : -10 }} animate={{ scale: 1, rotate: 0 }} className={small ? 'mb-4' : 'mb-6'}>
      <div
        className={`inline-block bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-full font-bold shadow-lg ${
          small ? 'px-6 py-2 text-lg' : 'px-8 py-3 text-2xl'
        }`}
      >
        🏆 FINAL ROUND - 2X POINTS! 🏆
      </div>
    </motion.div>
  )
}

// Who the room is still waiting on. Players whose phone dropped out are shown
// greyed out with a marker so the host knows why they are not responding.
function PlayerStatusRow({ players, isReady, size = 'lg' }) {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {players.map((p) => {
        const offline = p.connected === false
        const ready = isReady(p)
        return (
          <div key={p.id} className="relative flex flex-col items-center gap-1">
            <Avatar
              player={p}
              size={size}
              className={`text-xl transition-opacity ${ready && !offline ? 'opacity-100' : 'opacity-40'} ${
                ready && !offline ? 'ring-2 ring-success' : ''
              }`}
              showPulse={!ready && !offline}
            />
            {offline && (
              <span className="absolute -top-1 -right-1 text-sm" title="Disconnected">📴</span>
            )}
            <span className="text-xs text-text-muted max-w-[5rem] truncate">{p.name}</span>
          </div>
        )
      })}
    </div>
  )
}

export default HostGame
