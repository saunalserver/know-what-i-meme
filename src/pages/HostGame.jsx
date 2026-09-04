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

// Fluid sizes reused across phases, so the same idea is the same size on every
// screen: an avatar in a waiting row, a meme thumbnail in a results row.
const AVATAR_LG = 'w-[clamp(3rem,5.2vw,6rem)] h-[clamp(3rem,5.2vw,6rem)] text-tv-lg'
const AVATAR_MD = 'w-[clamp(2.25rem,3.4vw,4rem)] h-[clamp(2.25rem,3.4vw,4rem)] text-tv-body'
const AVATAR_SM = 'w-[clamp(1.5rem,2.1vw,2.5rem)] h-[clamp(1.5rem,2.1vw,2.5rem)] text-tv-label'

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
    <div
      className="h-screen bg-transparent flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* The bar is tall enough to hold the countdown pill outright. It used to
          be shorter than its own contents, so the pill hung below the bar and
          the label inside it was clipped off the top. */}
      <header className="tv-safe py-[clamp(0.5rem,1.2vh,1.25rem)] min-h-[clamp(3.5rem,7vh,6rem)] bg-dark-secondary/80 backdrop-blur border-b border-line flex justify-between items-center gap-6 shrink-0 z-40">
        <div className="text-tv-label text-text-secondary shrink-0">
          Room <span className="text-accent font-bold tracking-widest">{gameState.code}</span>
        </div>

        <div className="flex-1 flex justify-center">
          {timer && (
            <Timer seconds={timer.seconds} total={timer.total} phase={timer.phase} size="tv" />
          )}
        </div>

        <div className="flex items-center gap-[clamp(0.75rem,1.5vw,1.75rem)] shrink-0">
          <button
            onClick={toggleMusic}
            className={`w-[clamp(2rem,2.6vw,3rem)] h-[clamp(2rem,2.6vw,3rem)] grid place-items-center rounded-lg transition-colors ${
              musicEnabled
                ? 'bg-accent/20 hover:bg-accent/40'
                : 'bg-dark-tertiary hover:bg-dark-elevated'
            }`}
            title={musicEnabled ? 'Mute music' : 'Enable music'}
            aria-label={musicEnabled ? 'Mute music' : 'Enable music'}
          >
            {musicEnabled ? '🎵' : '🔇'}
          </button>
          <div className="text-tv-label text-text-secondary whitespace-nowrap tabular-nums">
            Round <span className="text-white font-bold">{gameState.currentRound}</span> / {gameState.totalRounds}
          </div>
          {phase !== 'lobby' && phase !== 'final_results' && (
            <button
              onClick={resetGame}
              className="text-tv-label px-3 py-1 bg-error/15 hover:bg-error/35 text-error rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 tv-safe py-[clamp(1rem,2.5vh,2.5rem)] flex flex-col">
        <AnimatePresence mode="wait">
          {/* LOBBY */}
          {phase === 'lobby' && (
            <Phase key="waiting" className="items-center justify-center text-center">
              <h1 className="text-tv-2xl font-bold text-white mb-[clamp(1rem,3vh,2.5rem)]">Starting Soon…</h1>
              <div className="flex flex-wrap justify-center gap-[clamp(1rem,2vw,2rem)]">
                {players.map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-2">
                    <Avatar player={p} size={null} className={AVATAR_LG} />
                    <span className="text-tv-label text-text-secondary">{p.name}</span>
                  </div>
                ))}
              </div>
            </Phase>
          )}

          {/* PROMPT VOTE */}
          {phase === 'prompt_vote' && (
            <Phase key="prompt-vote" className="justify-between">
              <PhaseHeading
                title="Vote for a prompt"
                subtitle="Pick your favourite on your phone"
              />

              {/* The options are on screen too, so the room can read along. */}
              <div className="flex flex-col gap-[clamp(0.5rem,1.5vh,1.25rem)] w-full max-w-[80rem] mx-auto">
                {(gameState.currentPromptOptions || []).map((prompt, index) => {
                  const votes = gameState.promptVoteCounts?.[index] || 0
                  return (
                    <div
                      key={index}
                      className="card !p-[clamp(0.75rem,1.6vw,1.75rem)] flex items-center gap-[clamp(0.75rem,1.5vw,1.75rem)]"
                    >
                      <OptionNumber n={index + 1} />
                      <span className="text-tv-body text-white flex-1 text-left">{prompt}</span>
                      <span
                        className={`text-tv-lg font-bold tabular-nums shrink-0 w-[2ch] text-right ${
                          votes > 0 ? 'text-accent' : 'text-text-muted'
                        }`}
                      >
                        {votes}
                      </span>
                    </div>
                  )
                })}
              </div>

              <PlayerStatusRow players={players} isReady={p => p.promptVote !== null} label="Voted" />
            </Phase>
          )}

          {/* GIF SEARCH */}
          {phase === 'gif_search' && (
            <Phase key="gif-search" className="justify-between">
              <div className="text-center">
                {gameState.isFinalRound && <FinalRoundBanner />}
                <PhaseHeading title="Find a GIF for this" subtitle="Search on your phone" />
              </div>

              <div className="card !p-[clamp(1.5rem,4vw,4rem)] w-full max-w-[80rem] mx-auto text-center">
                <p className="text-tv-xl text-white font-bold text-balance">
                  &ldquo;{gameState.currentPrompt}&rdquo;
                </p>
              </div>

              <PlayerStatusRow players={players} isReady={p => p.hasSubmitted} label="Submitted" />
            </Phase>
          )}

          {/* PRESENTATION — the moment the whole room is looking at the TV, so
              the GIF gets every pixel left over once the caption and the button
              have taken theirs. */}
          {phase === 'presentation' && currentMemePlayer && (
            <Phase key="presentation" className="justify-between gap-[clamp(1rem,2.8vh,2.5rem)]">
              <div className="w-full max-w-[80rem] mx-auto text-center shrink-0">
                <p className="text-tv-label text-text-muted uppercase tracking-widest mb-2 tabular-nums">
                  Meme {gameState.presentationIndex + 1} of {memeCount}
                </p>
                <p className="text-tv-xl text-white font-bold text-balance leading-tight">
                  &ldquo;{gameState.currentPrompt}&rdquo;
                </p>
              </div>

              {currentMemePlayer.currentGif && (
                <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                  {/* `w-full h-full object-contain` rather than `max-h-*`:
                      Klipy GIFs are often only ~250px across, and a max-height
                      never scales anything *up*, so the punchline of the round
                      used to sit on a 1080p TV at its intrinsic postage-stamp
                      size. This fills the stage and keeps the aspect ratio. */}
                  <motion.img
                    key={currentMemePlayer.currentGif}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25 }}
                    src={currentMemePlayer.currentGif}
                    alt="Submitted meme"
                    className="w-full h-full object-contain rounded-2xl drop-shadow-2xl"
                  />
                </div>
              )}

              <div className="shrink-0 flex justify-center">
                <button
                  onClick={advancePresentation}
                  className="btn-primary text-tv-lg px-[clamp(1.5rem,3vw,4rem)] py-[clamp(0.5rem,1.2vh,1.15rem)]"
                >
                  {gameState.presentationIndex < memeCount - 1 ? 'Next Meme →' : 'Start Voting'}
                </button>
              </div>
            </Phase>
          )}

          {/* VOTING */}
          {phase === 'voting' && (
            <Phase key="voting" className="justify-between">
              <div className="text-center shrink-0">
                <p className="text-tv-xl text-white font-bold text-balance leading-tight">
                  &ldquo;{gameState.currentPrompt}&rdquo;
                </p>
                <p className="text-tv-body text-text-secondary mt-2">
                  Vote for your favourite on your phone
                </p>
              </div>

              <div className="flex-1 min-h-0 flex items-center">
                <div
                  className="grid gap-[clamp(0.5rem,1.2vw,1.5rem)] w-full"
                  style={{ gridTemplateColumns: `repeat(${Math.min(memeCount, 4)}, minmax(0, 1fr))` }}
                >
                  {order.map((playerId, index) => {
                    const player = players.find(p => p.id === playerId)
                    if (!player) return null
                    return (
                      <div
                        key={playerId}
                        className="relative rounded-2xl overflow-hidden border border-line bg-dark-secondary"
                      >
                        <img
                          src={player.currentGif}
                          alt={`Meme ${index + 1}`}
                          className="w-full h-[clamp(6rem,26vh,20rem)] object-cover"
                        />
                        <span className="absolute top-2 left-2 bg-dark-primary/85 backdrop-blur rounded-lg px-3 py-1 text-tv-label font-bold tabular-nums">
                          #{index + 1}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <PlayerStatusRow
                players={players}
                isReady={p => p.hasVoted}
                label={`${players.filter(p => p.hasVoted).length} of ${
                  players.filter(p => p.connected !== false).length
                } voted`}
              />
            </Phase>
          )}

          {/* ROUND RESULTS */}
          {phase === 'round_results' && roundResults && (
            <Phase key="round-results" className="justify-between">
              <div className="text-center shrink-0">
                {gameState.isFinalRound && <FinalRoundBanner small />}
                <h2 className="text-tv-2xl text-white font-bold">Round {gameState.currentRound} Results</h2>
              </div>

              <div className="flex-1 min-h-0 flex flex-col justify-center gap-[clamp(0.4rem,1.2vh,1rem)] w-full max-w-[80rem] mx-auto">
                {roundResults.map((result, index) => {
                  const isWinner = index === 0 && result.votesReceived > 0
                  return (
                    <motion.div
                      key={result.playerId}
                      initial={{ opacity: 0, x: -40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.15 }}
                      className={`card !p-[clamp(0.5rem,1vw,1rem)] flex items-center gap-[clamp(0.75rem,1.5vw,1.75rem)] ${
                        isWinner ? '!border-success/70 bg-success/5' : ''
                      }`}
                    >
                      <div
                        className={`text-tv-lg font-bold tabular-nums w-[2.5ch] text-center shrink-0 ${
                          isWinner ? 'text-success' : 'text-text-muted'
                        }`}
                      >
                        {index + 1}
                      </div>

                      <img
                        src={result.gifUrl}
                        alt=""
                        className="w-[clamp(3.5rem,7vw,8rem)] h-[clamp(3.5rem,7vw,8rem)] object-cover rounded-xl shrink-0"
                      />

                      <div className="flex items-center gap-3 min-w-0 w-[clamp(8rem,18vw,22rem)] shrink-0">
                        <Avatar
                          player={{ photo: result.playerPhoto, color: result.playerColor, name: result.playerName }}
                          size={null}
                          className={AVATAR_MD}
                        />
                        <p className="text-tv-body font-bold text-white truncate">{result.playerName}</p>
                      </div>

                      {/* Voters fill the middle, which used to be dead space. */}
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                        {result.voters?.length > 0 ? (
                          result.voters.map((voter) => (
                            <div
                              key={voter.voterId}
                              className="flex items-center gap-2 bg-dark-tertiary rounded-full pl-1 pr-3 py-1"
                            >
                              <div
                                className={`${AVATAR_SM} rounded-full grid place-items-center font-bold text-dark-primary`}
                                style={{ backgroundColor: voter.voterColor }}
                              >
                                {voter.voterName.charAt(0)}
                              </div>
                              <span className="text-tv-label text-text-secondary">{voter.voterName}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-tv-label text-text-muted italic">No votes this round</span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={`text-tv-lg font-bold tabular-nums ${
                            result.pointsEarned > 0 ? 'text-success' : 'text-text-muted'
                          }`}
                        >
                          +{result.pointsEarned}
                        </p>
                        {result.multiplier > 1 && result.votesReceived > 0 && (
                          <p className="text-tv-label text-warning tabular-nums">
                            {result.votesReceived} × {result.multiplier}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              <div className="shrink-0 flex justify-center">
                <button
                  onClick={nextRound}
                  className="btn-success text-tv-lg px-[clamp(1.5rem,3vw,4rem)] py-[clamp(0.5rem,1.2vh,1.15rem)]"
                >
                  {gameState.currentRound >= gameState.totalRounds ? 'See Final Results' : 'Next Round →'}
                </button>
              </div>
            </Phase>
          )}

          {/* LEADERBOARD */}
          {phase === 'leaderboard' && (
            <Phase key="leaderboard" className="justify-between">
              <div className="text-center shrink-0">
                <h2 className="text-tv-2xl text-white font-bold">Standings</h2>
                <p className="text-tv-body text-text-secondary mt-1">
                  After round {gameState.currentRound} of {gameState.totalRounds}
                </p>
              </div>

              <div className="flex-1 min-h-0 flex flex-col justify-center gap-[clamp(0.4rem,1.2vh,1rem)] w-full max-w-[70rem] mx-auto">
                {ranked.map((player, index) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.12 }}
                    className={`flex items-center gap-[clamp(0.75rem,1.5vw,1.75rem)] rounded-2xl px-[clamp(0.75rem,1.5vw,1.75rem)] py-[clamp(0.4rem,1vh,1rem)] border ${
                      index === 0
                        ? 'bg-gradient-to-r from-warning/20 to-transparent border-warning/60'
                        : 'bg-dark-secondary border-line'
                    }`}
                  >
                    <div className="text-tv-lg font-bold w-[2.5ch] text-center shrink-0">{medal(index)}</div>
                    <Avatar player={player} size={null} className={AVATAR_MD} />
                    <p className="text-tv-body font-bold text-white flex-1 truncate text-left">{player.name}</p>
                    <div className="text-tv-lg font-bold text-accent tabular-nums shrink-0">
                      {player.score}
                      <span className="text-tv-label text-text-muted font-normal ml-2">pts</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="shrink-0 flex justify-center">
                <button
                  onClick={nextRound}
                  className="btn-success text-tv-lg px-[clamp(1.5rem,3vw,4rem)] py-[clamp(0.5rem,1.2vh,1.15rem)]"
                >
                  Continue to Round {gameState.currentRound + 1} →
                </button>
              </div>
            </Phase>
          )}

          {/* FINAL RESULTS */}
          {phase === 'final_results' && (
            <Phase key="final-results" className="justify-between">
              <h2 className="text-tv-2xl text-white font-bold text-center shrink-0">🏆 Winner 🏆</h2>

              {ranked.length === 0 ? (
                <p className="text-text-secondary text-tv-lg text-center">Everyone left before the end!</p>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col justify-center items-center gap-[clamp(1rem,3vh,2.5rem)]">
                  <motion.div
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className="flex flex-col items-center gap-3"
                  >
                    <Avatar
                      player={ranked[0]}
                      size={null}
                      className="w-[clamp(5rem,11vw,13rem)] h-[clamp(5rem,11vw,13rem)] text-tv-2xl"
                    />
                    <h3 className="text-tv-xl text-white font-bold">{ranked[0].name}</h3>
                    <p className="text-tv-lg text-success font-bold tabular-nums">{ranked[0].score} points</p>
                  </motion.div>

                  {ranked.length > 1 && (
                    <div className="flex flex-wrap justify-center gap-[clamp(0.5rem,1.2vw,1.5rem)]">
                      {ranked.slice(1).map((player, i) => (
                        <div
                          key={player.id}
                          className="card !p-[clamp(0.75rem,1.4vw,1.5rem)] flex items-center gap-3 min-w-[clamp(9rem,15vw,18rem)]"
                        >
                          <span className="text-tv-label text-text-muted font-bold w-[2ch]">{i + 2}</span>
                          <Avatar player={player} size={null} className={AVATAR_MD} />
                          <div className="min-w-0 text-left">
                            <p className="text-tv-label font-bold text-white truncate">{player.name}</p>
                            <p className="text-tv-label text-text-secondary tabular-nums">{player.score} pts</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="shrink-0 flex flex-wrap gap-[clamp(0.75rem,1.5vw,1.5rem)] justify-center">
                <button
                  onClick={() => restartGame(gameState.totalRounds)}
                  className="btn-success text-tv-lg px-[clamp(1.25rem,2.5vw,3rem)] py-[clamp(0.5rem,1.2vh,1.15rem)]"
                >
                  🔄 Play Again
                </button>
                <button
                  onClick={resetGame}
                  className="btn-secondary text-tv-lg px-[clamp(1.25rem,2.5vw,3rem)] py-[clamp(0.5rem,1.2vh,1.15rem)]"
                >
                  🏠 Back to Lobby
                </button>
              </div>
            </Phase>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

/**
 * Every phase is the same shape: a full-height flex column that fills the
 * screen. Keeping that in one place is what stops each phase from drifting into
 * its own centred island with different dead space above and below.
 */
function Phase({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex-1 min-h-0 flex flex-col ${className}`}
    >
      {children}
    </motion.div>
  )
}

function PhaseHeading({ title, subtitle }) {
  return (
    <div className="text-center shrink-0">
      <h2 className="text-tv-xl text-white font-bold">{title}</h2>
      {subtitle && <p className="text-tv-body text-text-secondary mt-1">{subtitle}</p>}
    </div>
  )
}

function OptionNumber({ n }) {
  return (
    <span className="shrink-0 grid place-items-center w-[clamp(2rem,3vw,3.5rem)] h-[clamp(2rem,3vw,3.5rem)] rounded-xl bg-dark-tertiary text-accent font-bold text-tv-body tabular-nums">
      {n}
    </span>
  )
}

function medal(index) {
  return index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`
}

function FinalRoundBanner({ small = false }) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: small ? 0 : -8 }}
      animate={{ scale: 1, rotate: 0 }}
      className="mb-[clamp(0.5rem,1.5vh,1.25rem)]"
    >
      <div className="inline-block bg-gradient-to-r from-warning to-orange-500 text-dark-primary rounded-full font-extrabold shadow-lg px-[clamp(1rem,2vw,2.5rem)] py-[clamp(0.25rem,0.8vh,0.75rem)] text-tv-body">
        🏆 FINAL ROUND — 2× POINTS 🏆
      </div>
    </motion.div>
  )
}

// Who the room is still waiting on. Players whose phone dropped out are shown
// greyed out with a marker so the host knows why they are not responding.
function PlayerStatusRow({ players, isReady, label }) {
  return (
    <div className="shrink-0 flex flex-col items-center gap-[clamp(0.4rem,1vh,0.9rem)]">
      {label && (
        <p className="text-tv-label text-text-muted uppercase tracking-widest tabular-nums">{label}</p>
      )}
      <div className="flex flex-wrap justify-center gap-[clamp(0.75rem,1.5vw,1.75rem)]">
        {players.map((p) => {
          const offline = p.connected === false
          const ready = isReady(p)
          return (
            <div key={p.id} className="relative flex flex-col items-center gap-1.5">
              {/* Waiting players keep their full colour. Dimming them to 55%
                  over the navy backdrop collapsed red, teal and amber into the
                  same olive, so the room could not tell who it was waiting on
                  — which is the only thing this row is for. The ring carries
                  the state instead. */}
              <Avatar
                player={p}
                size={null}
                className={`${AVATAR_LG} transition-all ${
                  offline
                    ? 'opacity-30 grayscale'
                    : ready
                      ? 'ring-4 ring-success'
                      : 'ring-2 ring-line'
                }`}
              />
              {ready && !offline && (
                <span className="absolute -top-1 -right-1 bg-success text-dark-primary rounded-full w-[clamp(1.1rem,1.6vw,2rem)] h-[clamp(1.1rem,1.6vw,2rem)] grid place-items-center text-tv-label font-bold">
                  ✓
                </span>
              )}
              {offline && (
                <span className="absolute -top-1 -right-1 text-tv-label" title="Disconnected">📴</span>
              )}
              <span className="text-tv-label text-text-muted max-w-[7rem] truncate">{p.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HostGame
