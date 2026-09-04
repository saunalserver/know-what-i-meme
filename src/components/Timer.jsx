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

/**
 * The shared countdown.
 *
 * `variant` picks how it sits in its container:
 *  - `pill`   — its own filled surface, for the host's big screen, where the
 *               colour change at 10s and 5s has to be visible across a room.
 *  - `inline` — no surface of its own, for the phone header, which is already
 *               a card; a second filled box inside it just showed a seam.
 */
export function Timer({ seconds, total, phase, variant = 'pill', size = 'md' }) {
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
  const isPill = variant === 'pill'
  const tv = size === 'tv'

  // On a filled urgent pill the text has to flip to stay legible; inline, the
  // surface never changes, so the numerals themselves carry the warning.
  const digitColor = isPill
    ? isCritical
      ? 'text-white'
      : isUrgent
        ? 'text-black'
        : 'text-accent'
    : isCritical
      ? 'text-error'
      : isUrgent
        ? 'text-warning'
        : 'text-accent'

  const labelColor = isPill && isCritical ? 'text-white/80' : isPill && isUrgent ? 'text-black/70' : 'text-text-secondary'
  const trackColor = isPill && isUrgent ? 'bg-black/20' : 'bg-dark-tertiary'
  const barColor = isPill
    ? isCritical
      ? 'bg-white'
      : isUrgent
        ? 'bg-black'
        : 'bg-accent'
    : isCritical
      ? 'bg-error'
      : isUrgent
        ? 'bg-warning'
        : 'bg-accent'

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        isPill
          ? `flex items-center gap-4 rounded-full shadow-lg ${tv ? 'px-7 py-2.5' : 'px-5 py-2'} ${
              isCritical ? 'bg-error' : isUrgent ? 'bg-warning' : 'bg-dark-elevated border border-line'
            }`
          : 'flex items-center gap-3'
      }
    >
      <div className={isPill ? 'text-center leading-tight' : 'text-right leading-tight'}>
        {label && (
          <p className={`${tv ? 'text-tv-label' : 'text-xs'} font-medium whitespace-nowrap ${labelColor}`}>
            {label}
          </p>
        )}
        <motion.p
          key={seconds}
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          className={`${tv ? 'text-tv-lg' : 'text-xl'} font-bold tabular-nums leading-none ${digitColor}`}
        >
          {formatTime(seconds)}
        </motion.p>
      </div>

      <div className={`${tv ? 'w-32' : 'w-16'} h-2 ${trackColor} rounded-full overflow-hidden shrink-0`}>
        <motion.div
          initial={false}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>
    </motion.div>
  )
}

export default Timer
