import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

function Home() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-dark-primary via-dark-secondary to-dark-tertiary">
      {/* Logo / Title */}
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-4">
          <span className="text-accent">Know</span> What I Meme
        </h1>
        <p className="text-text-secondary text-xl md:text-2xl">
          The party game of GIFs and good times!
        </p>
      </motion.div>

      {/* Animated emoji */}
      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-6xl mb-12"
      >
        😂
      </motion.div>

      {/* Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex flex-col md:flex-row gap-6"
      >
        <button
          onClick={() => navigate('/host')}
          className="btn-primary text-xl px-12 py-4 rounded-xl flex items-center gap-3"
        >
          <span className="text-2xl">🖥️</span>
          Host Game
        </button>

        <button
          onClick={() => navigate('/join')}
          className="btn-secondary text-xl px-12 py-4 rounded-xl flex items-center gap-3"
        >
          <span className="text-2xl">📱</span>
          Join Game
        </button>
      </motion.div>

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-16 text-center max-w-2xl"
      >
        <h2 className="text-2xl font-bold text-white mb-4">How to Play</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-text-secondary">
          <div className="card">
            <div className="text-3xl mb-2">🗳️</div>
            <p>Vote on a meme prompt</p>
          </div>
          <div className="card">
            <div className="text-3xl mb-2">🔍</div>
            <p>Find the perfect GIF</p>
          </div>
          <div className="card">
            <div className="text-3xl mb-2">🏆</div>
            <p>Win votes to prove you're the funniest!</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Home
