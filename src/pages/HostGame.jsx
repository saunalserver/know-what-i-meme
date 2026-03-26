import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import Timer from '../components/Timer'
import Avatar from '../components/Avatar'
import soundManager from '../utils/sounds'
import musicManager from '../utils/music'

function HostGame() {
  const { gameState, advancePresentation, nextRound, roundResults, timer, resetGame, restartGame } = useGame()
  const prevPhaseRef = useRef(null)
  const [musicEnabled, setMusicEnabled] = useState(true)

  // Play ambient background music based on phase
  useEffect(() => {
    if (gameState?.phase && musicEnabled) {
      musicManager.play(gameState.phase)
    } else if (!musicEnabled) {
      musicManager.stop()
    }
    return () => {
      musicManager.stop()
    }
  }, [gameState?.phase, musicEnabled])

  // Play phase transition sounds
  useEffect(() => {
    if (prevPhaseRef.current && prevPhaseRef.current !== gameState?.phase) {
      if (gameState?.phase === 'presentation') {
        soundManager.whoosh()
      } else if (gameState?.phase === 'round_results') {
        soundManager.roundComplete()
      } else if (gameState?.phase === 'final_results') {
        soundManager.celebration()
      } else if (gameState?.phase === 'prompt_vote' || gameState?.phase === 'gif_search' || gameState?.phase === 'voting') {
        soundManager.whoosh()
      }
    }
    prevPhaseRef.current = gameState?.phase
  }, [gameState?.phase])

  const toggleMusic = () => {
    setMusicEnabled(!musicEnabled)
    musicManager.setEnabled(!musicEnabled)
  }

  if (!gameState) return null

  // Use randomized presentation order for anonymous display
  const getCurrentMemePlayer = () => {
    if (!gameState.presentationOrder || gameState.presentationOrder.length === 0) {
      return gameState.players[gameState.presentationIndex]
    }
    const playerId = gameState.presentationOrder[gameState.presentationIndex]
    return gameState.players.find(p => p.id === playerId)
  }
  const currentMemePlayer = getCurrentMemePlayer()

  return (
    <div className="min-h-screen bg-dark-primary flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Timer - positioned at top, doesn't block content */}
      {timer && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-dark-primary" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <Timer seconds={timer.seconds} total={timer.total} phase={timer.phase} />
        </div>
      )}

      {/* Header - add top margin when timer is present */}
      <header className={`bg-dark-secondary p-4 flex justify-between items-center ${timer ? 'mt-14' : ''}`}>
        <div className="text-text-secondary">
          Room: <span className="text-accent font-bold">{gameState.code}</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Music Toggle */}
          <button
            onClick={toggleMusic}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              musicEnabled
                ? 'bg-accent/20 hover:bg-accent/40 text-accent'
                : 'bg-dark-tertiary hover:bg-dark-tertiary/80 text-text-secondary'
            }`}
            title={musicEnabled ? 'Mute Music' : 'Enable Music'}
          >
            {musicEnabled ? '🎵' : '🔇'}
          </button>
          <div className="text-text-secondary">
            Round {gameState.currentRound} / {gameState.totalRounds}
          </div>
          {/* Host Controls - always visible during game */}
          {gameState.phase !== 'lobby' && gameState.phase !== 'final_results' && (
            <button
              onClick={resetGame}
              className="px-3 py-1 text-sm bg-error/20 hover:bg-error/40 text-error rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {/* LOBBY / WAITING */}
          {(gameState.phase === 'lobby' || gameState.phase === 'waiting') && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <h1 className="text-4xl font-bold text-white mb-4">Starting Soon...</h1>
              <div className="flex flex-wrap justify-center gap-4">
                {gameState.players.map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1">
                    <Avatar player={p} size="lg" className="text-xl" />
                    <span className="text-sm text-text-secondary">{p.name}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* PROMPT VOTE */}
          {gameState.phase === 'prompt_vote' && (
            <motion.div
              key="prompt-vote"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center w-full max-w-4xl"
            >
              <h2 className="text-3xl text-text-secondary mb-8">
                Players are voting on a prompt...
              </h2>
              <div className="flex flex-wrap justify-center gap-4">
                {gameState.players.map((p) => (
                  <Avatar
                    key={p.id}
                    player={p}
                    size="lg"
                    className={`text-xl transition-opacity ${p.promptVote !== null ? 'opacity-100' : 'opacity-50'}`}
                    showPulse={p.promptVote === null}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* GIF SEARCH */}
          {gameState.phase === 'gif_search' && (
            <motion.div
              key="gif-search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center w-full max-w-4xl"
            >
              {/* Final Round Banner */}
              {gameState.isFinalRound && (
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="mb-6"
                >
                  <div className="inline-block bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-8 py-3 rounded-full text-2xl font-bold shadow-lg">
                    🏆 FINAL ROUND - 2X POINTS! 🏆
                  </div>
                </motion.div>
              )}
              <h2 className="text-2xl text-text-secondary mb-4">Prompt:</h2>
              <div className="bg-dark-secondary rounded-xl p-8 mb-8">
                <p className="text-4xl text-white font-bold">
                  "{gameState.currentPrompt}"
                </p>
              </div>
              <p className="text-xl text-text-secondary mb-4">
                Players are searching for GIFs...
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {gameState.players.map((p) => (
                  <Avatar
                    key={p.id}
                    player={p}
                    size="lg"
                    className={`text-xl transition-opacity ${p.hasSubmitted ? 'opacity-100' : 'opacity-50'}`}
                    showPulse={!p.hasSubmitted}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* PRESENTATION */}
          {gameState.phase === 'presentation' && currentMemePlayer && (
            <motion.div
              key="presentation"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center w-full h-full flex flex-col items-center justify-center"
            >
              {/* Anonymous header - just show meme number */}
              <div className="mb-6 text-3xl text-text-secondary font-bold">
                Meme #{gameState.presentationIndex + 1}
              </div>

              {/* Prompt at top */}
              <div className="bg-dark-secondary rounded-xl p-6 mb-6 max-w-3xl mx-auto">
                <p className="text-3xl text-white font-bold">
                  "{gameState.currentPrompt}"
                </p>
              </div>

              {/* Large centered GIF */}
              {currentMemePlayer.currentGif && (
                <div className="flex-1 flex items-center justify-center w-full max-w-5xl mx-auto">
                  <img
                    src={currentMemePlayer.currentGif}
                    alt="Meme GIF"
                    className="max-w-full max-h-[65vh] object-contain rounded-xl shadow-2xl"
                  />
                </div>
              )}

              <button
                onClick={advancePresentation}
                className="btn-primary mt-8 text-xl px-8 py-4"
              >
                {gameState.presentationIndex < gameState.players.length - 1
                  ? 'Next Meme →'
                  : 'Start Voting'}
              </button>
            </motion.div>
          )}

          {/* VOTING */}
          {gameState.phase === 'voting' && (
            <motion.div
              key="voting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center w-full max-w-5xl"
            >
              <h2 className="text-4xl text-white font-bold mb-2">
                "{gameState.currentPrompt}"
              </h2>
              <p className="text-xl text-text-secondary mb-6">
                Vote for your favorite on your phone!
              </p>

              {/* Anonymous meme grid - use randomized order to match presentation */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                {(gameState.presentationOrder || gameState.players.map(p => p.id)).map((playerId, index) => {
                  const player = gameState.players.find(p => p.id === playerId)
                  if (!player) return null
                  return (
                    <div
                      key={playerId}
                      className="bg-dark-secondary rounded-xl overflow-hidden"
                    >
                      <img
                        src={player.currentGif}
                        alt={`Meme ${index + 1}`}
                        className="w-full h-40 object-cover"
                      />
                      <div className="p-2 text-center">
                        <span className="text-lg font-bold text-text-secondary">
                          Meme #{index + 1}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Voting progress */}
              <p className="text-text-muted text-sm mb-4">
                {gameState.players.filter(p => p.hasVoted).length} / {gameState.players.length} votes cast
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {gameState.players.map((p) => (
                  <Avatar
                    key={p.id}
                    player={p}
                    size="md"
                    className={`transition-opacity ${p.hasVoted ? 'opacity-100 ring-2 ring-success' : 'opacity-50'}`}
                    showPulse={!p.hasVoted}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ROUND RESULTS */}
          {gameState.phase === 'round_results' && roundResults && (
            <motion.div
              key="round-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center w-full max-w-4xl"
            >
              {/* Final Round Banner in Results */}
              {gameState.isFinalRound && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="mb-4"
                >
                  <div className="inline-block bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-2 rounded-full text-lg font-bold">
                    🏆 FINAL ROUND - 2X POINTS! 🏆
                  </div>
                </motion.div>
              )}
              <h2 className="text-4xl text-white font-bold mb-8">
                Round {gameState.currentRound} Results!
              </h2>

              <div className="space-y-4 mb-8">
                {roundResults.map((result, index) => (
                  <motion.div
                    key={result.playerId}
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.2 }}
                    className={`card ${index === 0 ? 'ring-2 ring-success' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-bold text-accent w-12">
                        #{index + 1}
                      </div>
                      <img
                        src={result.gifUrl}
                        alt="Meme"
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar player={{ photo: result.playerPhoto, color: result.playerColor, name: result.playerName }} size="sm" />
                          <p className="text-xl font-bold text-white">{result.playerName}</p>
                        </div>
                        <p className="text-success text-lg">
                          +{result.pointsEarned || result.votesReceived} pts
                          {result.multiplier > 1 && (
                            <span className="text-yellow-400 ml-2">
                              ({result.votesReceived} × {result.multiplier})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Vote breakdown - who voted for this player */}
                    {result.voters && result.voters.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dark-tertiary">
                        <p className="text-text-muted text-sm mb-2">Voted by:</p>
                        <div className="flex flex-wrap gap-2">
                          {result.voters.map((voter) => (
                            <div
                              key={voter.voterId}
                              className="flex items-center gap-1 bg-dark-tertiary rounded-full px-2 py-1"
                            >
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

              <button
                onClick={nextRound}
                className="btn-success text-xl px-12 py-4"
              >
                {gameState.currentRound >= gameState.totalRounds
                  ? 'See Final Results'
                  : 'Next Round →'}
              </button>
            </motion.div>
          )}

          {/* LEADERBOARD (every 3 rounds for games 5+ rounds) */}
          {gameState.phase === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center w-full max-w-4xl"
            >
              <h2 className="text-4xl text-white font-bold mb-2">
                📊 Leaderboard
              </h2>
              <p className="text-text-secondary mb-8">
                After Round {gameState.currentRound} of {gameState.totalRounds}
              </p>

              <div className="space-y-3 mb-8">
                {[...gameState.players]
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
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
                      <div className="text-3xl font-bold w-12">
                        {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </div>
                      <Avatar player={player} size="md" />
                      <div className="flex-1 text-left">
                        <p className="text-xl font-bold text-white">{player.name}</p>
                      </div>
                      <div className="text-2xl font-bold text-accent">
                        {player.score} pts
                      </div>
                    </motion.div>
                  ))}
              </div>

              <button
                onClick={nextRound}
                className="btn-success text-xl px-12 py-4"
              >
                Continue to Round {gameState.currentRound + 1} →
              </button>
            </motion.div>
          )}

          {/* FINAL RESULTS */}
          {gameState.phase === 'final_results' && (
            <motion.div
              key="final-results"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center w-full max-w-4xl"
            >
              <h2 className="text-5xl text-white font-bold mb-4">
                🏆 Winner! 🏆
              </h2>

              {(() => {
                const sorted = [...gameState.players].sort((a, b) => b.score - a.score)
                const winner = sorted[0]
                return (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="flex flex-col items-center mb-8"
                    >
                      <Avatar player={winner} size="2xl" className="mb-4" />
                      <h3 className="text-4xl text-white font-bold">{winner.name}</h3>
                      <p className="text-2xl text-success mt-2">{winner.score} points</p>
                    </motion.div>

                    <div className="grid grid-cols-3 gap-4 mb-8">
                      {sorted.slice(1).map((player, index) => (
                        <div key={player.id} className="card">
                          <Avatar player={player} size="md" className="mx-auto mb-2" />
                          <p className="font-bold">{player.name}</p>
                          <p className="text-text-secondary">{player.score} pts</p>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}

              {/* Play Again Controls */}
              <div className="flex flex-col gap-4 items-center">
                <div className="flex gap-4">
                  <button
                    onClick={() => restartGame(gameState.totalRounds)}
                    className="btn-success text-xl px-8 py-4"
                  >
                    🔄 Play Again ({gameState.totalRounds} rounds)
                  </button>
                  <button
                    onClick={resetGame}
                    className="btn-primary text-xl px-8 py-4"
                  >
                    🏠 Back to Lobby
                  </button>
                </div>
                <p className="text-text-secondary text-sm mt-4">
                  Same players, fresh start!
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default HostGame
