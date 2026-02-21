import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import GifSearch from '../components/player/GifSearch'
import soundManager from '../utils/sounds'

function PlayerGame() {
  const {
    gameState,
    player,
    votePrompt,
    submitGif,
    castVote,
    error,
    clearError,
  } = useGame()
  const [selectedGif, setSelectedGif] = useState(null)

  // Clear selected GIF when a new round starts (phase changes to gif_search)
  useEffect(() => {
    if (gameState?.phase === 'gif_search') {
      // Sync with server state - if player has already submitted, show their current GIF
      const myPlayer = gameState.players.find((p) => p.id === player?.id)
      if (myPlayer?.hasSubmitted && myPlayer?.currentGif) {
        setSelectedGif(myPlayer.currentGif)
      } else {
        setSelectedGif(null)
      }
    }
  }, [gameState?.phase, gameState?.currentRound, gameState?.players, player?.id])

  if (!gameState || !player) return null

  const myPlayer = gameState.players.find((p) => p.id === player.id)
  if (!myPlayer) return null

  const handlePromptVote = (index) => {
    // Toggle selection - clicking same prompt deselects it
    soundManager.select()
    votePrompt(index)
  }

  const handleGifSelect = (gifUrl) => {
    soundManager.select()
    setSelectedGif(gifUrl)
  }

  const handleSubmitGif = () => {
    if (selectedGif) {
      soundManager.success()
      submitGif(selectedGif)
    }
  }

  const handleVote = (targetId) => {
    if (targetId !== player.id) {
      soundManager.voteReceived()
      castVote(targetId)
    }
  }

  return (
    <div className="min-h-screen bg-dark-primary flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Error Toast */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-4 right-4 bg-error text-white px-4 py-3 rounded-lg shadow-lg z-50 flex justify-between items-center"
        >
          {error}
          <button onClick={clearError} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </motion.div>
      )}

      {/* Header - Player Info */}
      <header className="bg-dark-secondary rounded-xl p-4 mb-4 flex items-center justify-between mx-4 mt-4">
        <div className="flex items-center gap-3">
          <div
            className="player-avatar w-10 h-10 text-base"
            style={{ backgroundColor: myPlayer.color }}
          >
            {myPlayer.name.charAt(0)}
          </div>
          <div>
            <p className="font-bold text-white">{myPlayer.name}</p>
            <p className="text-sm text-text-secondary">
              {myPlayer.score} points
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-text-secondary">Round</p>
          <p className="text-white font-bold">
            {gameState.currentRound}/{gameState.totalRounds}
          </p>
        </div>
      </header>

      {/* Main Content - with horizontal margin */}
      <main className="flex-1 flex flex-col mx-4 pb-4">
        <AnimatePresence mode="wait">
          {/* PROMPT VOTE */}
          {gameState.phase === 'prompt_vote' && (
            <motion.div
              key="prompt-vote"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-xl font-bold text-white mb-4">
                Vote for a Prompt
              </h2>

              <div className="space-y-3">
                {gameState.currentPromptOptions.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handlePromptVote(index)}
                    className={`w-full text-left p-4 rounded-xl transition-all ${
                      myPlayer.promptVote === index
                        ? 'bg-accent text-white ring-2 ring-accent-light'
                        : 'bg-dark-secondary hover:bg-dark-tertiary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {['1️⃣', '2️⃣', '3️⃣'][index]}
                      </span>
                      <span className="text-lg">{prompt}</span>
                    </div>
                  </button>
                ))}
              </div>

              {myPlayer.promptVote !== null ? (
                <p className="text-center text-text-secondary mt-4">
                  ✓ Vote submitted! Tap again to change.
                </p>
              ) : (
                <p className="text-center text-text-secondary mt-4">
                  Tap to vote for your favorite prompt
                </p>
              )}
            </motion.div>
          )}

          {/* GIF SEARCH */}
          {gameState.phase === 'gif_search' && (
            <motion.div
              key="gif-search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1 pb-24" /* Add padding for sticky button */
            >
              {/* Prompt Display - more compact */}
              <div className="bg-dark-secondary rounded-xl p-3 mb-2">
                <p className="text-lg font-bold text-white">
                  "{gameState.currentPrompt}"
                </p>
              </div>

              {/* GIF Search Component - takes remaining space */}
              <div className="flex-1">
                <GifSearch
                  onSelect={handleGifSelect}
                  selectedGif={selectedGif}
                />
              </div>

              {/* Sticky Submit Button Area - with safe area for iOS */}
              <div
                className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-dark-primary via-dark-primary to-transparent pt-8"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
              >
                {/* Submit Button */}
                {selectedGif && !myPlayer.hasSubmitted && (
                  <motion.button
                    key="submit"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={handleSubmitGif}
                    className="w-full btn-success text-lg py-4"
                  >
                    ✓ Submit GIF
                  </motion.button>
                )}

                {/* Already submitted */}
                {myPlayer.hasSubmitted && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="bg-success/20 border border-success/40 rounded-xl p-3 text-center mb-2">
                      <p className="text-success font-bold">✓ GIF Submitted!</p>
                    </div>
                    {selectedGif && selectedGif !== myPlayer.currentGif && (
                      <button
                        onClick={handleSubmitGif}
                        className="w-full bg-warning hover:bg-warning/80 text-dark-primary font-bold text-lg py-4 rounded-xl transition-colors"
                      >
                        🔄 Update to New GIF
                      </button>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* PRESENTATION */}
          {gameState.phase === 'presentation' && (
            <motion.div
              key="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <div className="text-6xl mb-4">👀</div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Watch the Big Screen!
              </h2>
              <p className="text-text-secondary">
                Memes are being revealed...
              </p>
            </motion.div>
          )}

          {/* VOTING */}
          {gameState.phase === 'voting' && (
            <motion.div
              key="voting"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-xl font-bold text-white mb-2">
                Vote for the Best Meme!
              </h2>
              <p className="text-text-secondary mb-4">
                "{gameState.currentPrompt}"
              </p>

              <div className="space-y-3">
                {gameState.players
                  .filter((p) => p.id !== player.id) // Can't vote for yourself
                  .map((p) => {
                    const myVote = gameState.votes?.[player.id]
                    const isSelected = myVote === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleVote(p.id)}
                        className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                          isSelected
                            ? 'bg-accent text-white ring-2 ring-accent-light'
                            : 'bg-dark-secondary hover:bg-dark-tertiary'
                        }`}
                      >
                        <div
                          className="player-avatar w-12 h-12 shrink-0"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name.charAt(0)}
                        </div>
                        <img
                          src={p.currentGif}
                          alt={`${p.name}'s meme`}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <span className="font-bold text-white">{p.name}</span>
                        {isSelected && <span className="ml-auto">✓</span>}
                      </button>
                    )
                  })}
              </div>

              {myPlayer.hasVoted ? (
                <p className="text-center text-text-secondary mt-4">
                  ✓ Vote submitted! Tap another to change.
                </p>
              ) : (
                <p className="text-center text-text-secondary mt-4">
                  Tap to vote for the best meme
                </p>
              )}
            </motion.div>
          )}

          {/* ROUND RESULTS */}
          {gameState.phase === 'round_results' && (
            <motion.div
              key="round-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Round Complete!
              </h2>
              <p className="text-text-secondary">
                Check the big screen for results
              </p>

              <div className="mt-6 bg-dark-secondary rounded-xl p-4">
                <p className="text-sm text-text-secondary">Your Score</p>
                <p className="text-4xl font-bold text-accent">{myPlayer.score}</p>
              </div>
            </motion.div>
          )}

          {/* LEADERBOARD */}
          {gameState.phase === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-6"
            >
              <h2 className="text-2xl font-bold text-white mb-1 text-center">
                📊 Standings
              </h2>
              <p className="text-text-secondary text-center mb-6">
                Round {gameState.currentRound} of {gameState.totalRounds}
              </p>

              <div className="space-y-2">
                {[...gameState.players]
                  .sort((a, b) => b.score - a.score)
                  .map((p, index) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-center gap-3 p-3 rounded-xl ${
                        p.id === player.id
                          ? 'bg-accent/20 ring-2 ring-accent'
                          : 'bg-dark-secondary'
                      }`}
                    >
                      <span className="text-lg font-bold w-6">
                        {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                      </span>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.name.charAt(0)}
                      </div>
                      <span className={`flex-1 font-medium ${p.id === player.id ? 'text-white' : 'text-text-secondary'}`}>
                        {p.name} {p.id === player.id && '(You)'}
                      </span>
                      <span className="font-bold text-accent">{p.score}</span>
                    </motion.div>
                  ))}
              </div>

              <p className="text-center text-text-secondary mt-6">
                Watch the big screen to continue...
              </p>
            </motion.div>
          )}

          {/* FINAL RESULTS */}
          {gameState.phase === 'final_results' && (
            <motion.div
              key="final-results"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-2xl font-bold text-white mb-4">
                Game Over!
              </h2>

              <div className="bg-dark-secondary rounded-xl p-6 mb-4">
                <p className="text-text-secondary mb-2">Final Score</p>
                <p className="text-5xl font-bold text-accent">{myPlayer.score}</p>
                <p className="text-text-secondary mt-1">points</p>
              </div>

              <p className="text-text-secondary">
                Check the big screen for the winner!
              </p>

              <div className="mt-6 p-4 bg-dark-secondary rounded-xl">
                <p className="text-text-secondary text-sm">
                  Waiting for host to start a new game...
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default PlayerGame
