import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function Countdown({ from = 5, onComplete, message = "Get Ready!" }) {
  const [count, setCount] = useState(from)

  useEffect(() => {
    if (count <= 0) {
      onComplete?.()
      return
    }

    const timer = setTimeout(() => {
      setCount(count - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [count, onComplete])

  return (
    <div className="fixed inset-0 bg-dark-primary/95 flex items-center justify-center z-50">
      <div className="text-center">
        <motion.p
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl text-text-secondary mb-8"
        >
          {message}
        </motion.p>

        <AnimatePresence mode="wait">
          <motion.div
            key={count}
            initial={{ scale: 2, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0, rotate: 10 }}
            transition={{ duration: 0.3 }}
            className="text-9xl font-bold text-accent"
          >
            {count > 0 ? count : 'GO!'}
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex justify-center gap-3 mt-8">
          {Array.from({ length: from }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 1 }}
              animate={{
                scale: from - count > i ? 0.5 : 1,
                backgroundColor: from - count > i ? '#6366f1' : '#4b5563'
              }}
              className="w-4 h-4 rounded-full bg-dark-tertiary"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function Intermission({ message, submessage, duration = 2000, onComplete }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onComplete?.()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onComplete])

  if (!visible) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-dark-primary/90 flex items-center justify-center z-40"
    >
      <div className="text-center">
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-5xl font-bold text-white mb-4"
        >
          {message}
        </motion.h2>
        {submessage && (
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-2xl text-text-secondary"
          >
            {submessage}
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}

export default Countdown
