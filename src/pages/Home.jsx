import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const STEPS = [
  { emoji: '🗳️', title: 'Vote on a prompt', body: 'Everyone picks the prompt the round is played on.' },
  { emoji: '🔍', title: 'Find the perfect GIF', body: 'Search on your phone for the funniest match.' },
  { emoji: '🏆', title: 'Win the room', body: 'Memes are anonymous — most votes takes the points.' },
]

function Home() {
  const navigate = useNavigate()

  return (
    // No gradient of its own: the body backdrop carries the atmosphere for the
    // whole app, and a second diagonal one here made the landing page look
    // like it came from a different product than the game.
    <div className="min-h-screen flex flex-col items-center justify-center tv-safe py-[clamp(2rem,6vh,5rem)]">
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h1 className="text-tv-2xl font-extrabold text-white leading-none">
          <span className="text-accent">Know</span> What I Meme
        </h1>
        <p className="text-text-secondary text-tv-body mt-[clamp(0.5rem,1.5vh,1.25rem)]">
          The party game of GIFs and good times
        </p>
      </motion.div>

      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        className="text-[clamp(3rem,5vw,6rem)] my-[clamp(1rem,3vh,2.5rem)]"
      >
        😂
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="flex flex-col sm:flex-row gap-[clamp(0.75rem,1.5vw,1.5rem)] w-full max-w-xl"
      >
        <button
          onClick={() => navigate('/host')}
          className="btn-primary flex-1 text-tv-body py-[clamp(0.75rem,1.6vh,1.4rem)] flex items-center justify-center gap-3"
        >
          <span aria-hidden="true">🖥️</span> Host Game
        </button>

        <button
          onClick={() => navigate('/join')}
          className="btn-secondary flex-1 text-tv-body py-[clamp(0.75rem,1.6vh,1.4rem)] flex items-center justify-center gap-3"
        >
          <span aria-hidden="true">📱</span> Join Game
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-[clamp(2rem,6vh,5rem)] w-full max-w-5xl"
      >
        <h2 className="text-tv-label font-bold text-text-muted uppercase tracking-[0.2em] text-center mb-[clamp(0.75rem,2vh,1.5rem)]">
          How to Play
        </h2>
        <ol className="grid gap-[clamp(0.75rem,1.5vw,1.5rem)] sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card !p-[clamp(1rem,1.8vw,2rem)] flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="text-[clamp(1.5rem,2.2vw,2.5rem)]" aria-hidden="true">
                  {step.emoji}
                </span>
                <span className="text-tv-label font-bold text-accent tabular-nums">
                  Step {i + 1}
                </span>
              </div>
              <p className="text-tv-body font-bold text-white leading-tight min-h-[2.4em]">{step.title}</p>
              <p className="text-tv-label text-text-secondary leading-snug">{step.body}</p>
            </li>
          ))}
        </ol>
      </motion.div>
    </div>
  )
}

export default Home
