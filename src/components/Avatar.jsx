import { motion } from 'framer-motion'
import { useState } from 'react'

/**
 * Reusable avatar component that shows a player's photo or initial letter
 */
function Avatar({ player, size = 'md', showPulse = false, className = '' }) {
  const { photo, color, name } = player
  const [imageError, setImageError] = useState(false)

  // Size classes
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-2xl',
    xl: 'w-24 h-24 text-4xl',
    '2xl': 'w-32 h-32 text-5xl',
  }

  // `size={null}` means the caller is sizing it themselves (the host screens
  // scale avatars fluidly with the viewport). Falling back to a preset here
  // would put a competing w-*/h-* in the same layer and win at random.
  const baseClass = size === null ? '' : sizeClasses[size] || sizeClasses.md

  // Use photo only if it exists and hasn't errored
  const showPhoto = photo && !imageError

  // If player has a photo, use it as background
  // Otherwise show the initial letter with the color background
  const style = {
    backgroundColor: showPhoto ? 'transparent' : color,
    backgroundImage: showPhoto ? `url(${photo})` : 'none',
  }

  return (
    <motion.div
      className={`player-avatar ${baseClass} ${showPulse ? 'animate-pulse' : ''} ${className}`}
      style={style}
      whileHover={{ scale: 1.05 }}
    >
      {!showPhoto && name?.charAt(0).toUpperCase()}
      {/* Hidden img to detect load errors */}
      {photo && !imageError && (
        <img
          src={photo}
          alt=""
          className="hidden"
          onError={() => setImageError(true)}
        />
      )}
    </motion.div>
  )
}

export default Avatar
