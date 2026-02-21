import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'

function HostGame() {
  const { gameState, advancePresentation, nextRound, roundResults } = useGame()
  const [showingMeme, setShowingMeme] = useState(null)

  // Handle presentation auto-advance
  useEffect(() => {
    if (gameState?.phase === 'presentation') {
      const player = gameState.players[gameState.presentationIndex]
      if (player) {
        setShowingMeme(player)
      }
    }
  }, [gameState?.phase, gameState?.presentationIndex, gameState?.players])

  if (!gameState) return null

  const currentMemePlayer = gameState.players[gameState.presentationIndex]

  return (
    <div className="min-h-screen bg-dark-primary flex flex-col">
      {/* Header */}
      <header className="bg-dark-secondary p-4 flex justify-between items-center">
        <div className="text-text-secondary">
          Room: <span className="text-accent font-bold">{gameState.code}</span>
        </div>
        <div className="text-text-secondary">
          Round {gameState.currentRound} / {gameState.totalRounds}
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
                  <div
                    key={p.id}
                    className="player-avatar text-xl"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0)}
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
                  <div
                    key={p.id}
                    className={`player-avatar text-xl transition-opacity ${p.promptVote !== null ? 'opacity-100' : 'opacity-50 animate-pulse'}`}
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0)}
                  </div>
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
                  <div
                    key={p.id}
                    className={`player-avatar text-xl transition-opacity ${p.hasSubmitted ? 'opacity-100' : 'opacity-50 animate-pulse'}`}
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0)}
                  </div>
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
              className="text-center w-full max-w-4xl"
            >
              <div className="mb-4 text-2xl text-text-secondary">
                <span
                  className="inline-block w-10 h-10 rounded-full mr-2 align-middle"
                  style={{ backgroundColor: currentMemePlayer.color }}
                />
                {currentMemePlayer.name}'s Meme
              </div>

              <div className="meme-card max-w-2xl mx-auto">
                <div className="bg-dark-tertiary p-6">
                  <p className="text-2xl text-white font-bold mb-4">
                    "{gameState.currentPrompt}"
                  </p>
                </div>
                {currentMemePlayer.currentGif && (
                  <img
                    src={currentMemePlayer.currentGif}
                    alt="Meme GIF"
                    className="w-full max-h-[60vh] object-contain"
                  />
                )}
              </div>

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
              className="text-center w-full max-w-4xl"
            >
              <h2 className="text-4xl text-white font-bold mb-4">
                "{gameState.currentPrompt}"
              </h2>
              <p className="text-2xl text-text-secondary mb-8">
                Players are voting for their favorite...
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {gameState.players.map((p) => (
                  <div
                    key={p.id}
                    className={`player-avatar text-xl transition-opacity ${p.hasVoted ? 'opacity-100' : 'opacity-50 animate-pulse'}`}
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0)}
                  </div>
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
                    className={`card flex items-center gap-4 ${index === 0 ? 'ring-2 ring-success' : ''}`}
                  >
                    <div className="text-3xl font-bold text-accent w-12">
                      #{index + 1}
                    </div>
                    <img
                      src={result.gifUrl}
                      alt="Meme"
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <p className="text-xl font-bold text-white">{result.playerName}</p>
                      <p className="text-success">
                        +{result.votesReceived} {result.votesReceived === 1 ? 'vote' : 'votes'}
                      </p>
                    </div>
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
                      className="mb-8"
                    >
                      <div
                        className="player-avatar w-32 h-32 text-5xl mx-auto mb-4"
                        style={{ backgroundColor: winner.color }}
                      >
                        {winner.name.charAt(0)}
                      </div>
                      <h3 className="text-4xl text-white font-bold">{winner.name}</h3>
                      <p className="text-2xl text-success mt-2">{winner.score} points</p>
                    </motion.div>

                    <div className="grid grid-cols-3 gap-4 mb-8">
                      {sorted.slice(1).map((player, index) => (
                        <div key={player.id} className="card">
                          <div
                            className="player-avatar w-12 h-12 mx-auto mb-2"
                            style={{ backgroundColor: player.color }}
                          >
                            {player.name.charAt(0)}
                          </div>
                          <p className="font-bold">{player.name}</p>
                          <p className="text-text-secondary">{player.score} pts</p>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}

              <p className="text-text-secondary text-xl">
                Thanks for playing! Refresh to start a new game.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default HostGame
