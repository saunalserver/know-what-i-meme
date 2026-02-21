// Reusable player avatar component that shows photo or colored initials

export function PlayerAvatar({ player, size = 'md', className = '', showName = false }) {
  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-2xl',
    '2xl': 'w-24 h-24 text-4xl',
    '3xl': 'w-32 h-32 text-5xl',
  }

  const sizeClass = sizes[size] || sizes.md

  if (player.photo) {
    return (
      <div className={`relative ${sizeClass} rounded-full overflow-hidden ${className}`}>
        <img
          src={player.photo}
          alt={player.name}
          className="w-full h-full object-cover"
        />
        {showName && (
          <span className="sr-only">{player.name}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`player-avatar ${sizeClass} ${className} flex items-center justify-center font-bold text-white`}
      style={{ backgroundColor: player.color }}
    >
      {player.name.charAt(0).toUpperCase()}
      {showName && <span className="sr-only">{player.name}</span>}
    </div>
  )
}

export default PlayerAvatar
