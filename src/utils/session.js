// Remembers who you were in a room so a refresh, a locked phone or a dropped
// wifi connection doesn't cost you your seat (or, for the host, the game).

const STORAGE_KEY = 'kwim_session'
const MAX_AGE_MS = 60 * 60 * 1000 // An hour covers a long game plus a break

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    // Private mode, blocked storage: reconnection is a nicety, not a requirement.
    return null
  }
}

function write(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, timestamp: Date.now() }))
  } catch {
    // Ignore: nothing here is worth breaking a join over.
  }
}

export function loadSession() {
  const session = read()
  if (!session?.code) return null
  if (Date.now() - (session.timestamp || 0) > MAX_AGE_MS) {
    clearSession()
    return null
  }
  return session
}

export function savePlayerSession(code, playerId) {
  write({ role: 'player', code, playerId })
}

export function saveHostSession(code) {
  write({ role: 'host', code })
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}
