import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import soundManager from '../utils/sounds'

const PHASE_LABELS = {
  prompt_vote: 'Vote for Prompt',
  gif_search: 'Find a GIF',
  voting: 'Cast Your Vote',
  presentation: 'Viewing Memes',
  round_results: 'Round Complete',
  leaderboard: 'Standings',
}

function formatTime(s) {
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
}

export function Timer({ seconds, total, phase, compact = false }) {
  const prevSecondsRef = useRef(seconds)
  const hasTime = typeof seconds === 'number'

  // Countdown cues. This has to run before any early return: bailing out first
  // changed the hook order between renders and crashed the component.
  useEffect(() => {
    if (!hasTime) return

    if (prevSecondsRef.current !== seconds) {
      if (seconds === 10 && prevSecondsRef.current > 10) {
        soundManager.timerUrgent()
      } else if (seconds === 5 && prevSecondsRef.current > 5) {
        soundManager.timerCritical()
      } else if (seconds <= 3 && seconds > 0) {
        soundManager.timerFinal()
      }
    }
    prevSecondsRef.current = seconds
  }, [seconds, hasTime])

  if (!hasTime) return null

  const percentage = total > 0 ? Math.max(0, Math.min(100, (seconds / total) * 100)) : 0
  const isUrgent = seconds <= 10
  const isCritical = seconds <= 5
  const label = PHASE_LABELS[phase] || ''

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl shadow-lg ${compact ? 'px-4 py-2' : 'px-6 py-3'} ${
        isCritical ? 'bg-error' : isUrgent ? 'bg-yellow-500' : 'bg-dark-secondary'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="text-center">
          {label && (
            <p className={`text-xs font-medium ${isCritical ? 'text-white' : 'text-text-secondary'}`}>
              {label}
            </p>
          )}
          <motion.p
            key={seconds}
            initial={{ scale: 1.15 }}
            animate={{ scale: 1 }}
            className={`${compact ? 'text-xl' : 'text-3xl'} font-bold tabular-nums ${
              isCritical ? 'text-white' : isUrgent ? 'text-black' : 'text-accent'
            }`}
          >
            {formatTime(seconds)}
          </motion.p>
        </div>

        <div className={`${compact ? 'w-16' : 'w-24'} h-2 bg-dark-tertiary rounded-full overflow-hidden`}>
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
