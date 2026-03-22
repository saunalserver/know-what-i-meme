import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import soundManager from '../utils/sounds'

export function Timer({ seconds, total, phase }) {
  const prevSecondsRef = useRef(seconds)

  if (!seconds && seconds !== 0) return null

  const percentage = (seconds / total) * 100
  const isUrgent = seconds <= 10
  const isCritical = seconds <= 5

  // Play sounds based on countdown
  useEffect(() => {
    // Only play if seconds changed
    if (prevSecondsRef.current !== seconds) {
      if (seconds === 10 && prevSecondsRef.current > 10) {
        soundManager.timerUrgent()
      } else if (seconds === 5 && prevSecondsRef.current > 5) {
        soundManager.timerCritical()
      } else if (seconds <= 3 && seconds > 0 && prevSecondsRef.current !== seconds) {
        soundManager.timerFinal()
      }
    }
    prevSecondsRef.current = seconds
  }, [seconds])

  const formatTime = (s) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
  }

  const getPhaseLabel = () => {
    switch (phase) {
      case 'prompt_vote': return 'Vote for Prompt'
      case 'gif_search': return 'Find a GIF'
      case 'voting': return 'Cast Your Vote'
      case 'presentation': return 'Viewing Memes'
      case 'round_results': return 'Round Complete'
      default: return ''
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg ${
        isCritical ? 'bg-error' : isUrgent ? 'bg-yellow-500' : 'bg-dark-secondary'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className={`text-xs font-medium ${isCritical ? 'text-white' : 'text-text-secondary'}`}>
            {getPhaseLabel()}
          </p>
          <motion.p
            key={seconds}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className={`text-3xl font-bold tabular-nums ${
              isCritical ? 'text-white' : isUrgent ? 'text-black' : 'text-accent'
            }`}
          >
            {formatTime(seconds)}
          </motion.p>
        </div>

        {/* Progress bar */}
        <div className="w-24 h-2 bg-dark-tertiary rounded-full overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5 }}
            className={`h-full rounded-full ${
              isCritical ? 'bg-white' : isUrgent ? 'bg-black' : 'bg-accent'
            }`}
          />
        </div>
      </div>
    </motion.div>
  )
}

export default Timer
