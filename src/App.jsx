import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useGame } from './context/useGame'

import Home from './pages/Home'

// Host and player never need each other's code, and the host lobby drags in the
// QR generator. Splitting them keeps the first load on a phone small.
const HostLobby = lazy(() => import('./pages/HostLobby'))
const HostGame = lazy(() => import('./pages/HostGame'))
const PlayerJoin = lazy(() => import('./pages/PlayerJoin'))
const PlayerGame = lazy(() => import('./pages/PlayerGame'))

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin text-6xl mb-4">🎮</div>
        <p className="text-text-secondary text-xl">Loading...</p>
      </div>
    </div>
  )
}

function App() {
  const { gameState, isHost, player } = useGame()

  // Host should be on HostLobby during lobby phase, HostGame during game
  const hostShouldBeInLobby = isHost && gameState && gameState.phase === 'lobby'
  const hostShouldBeInGame = isHost && gameState && gameState.phase !== 'lobby'

  return (
    <div className="min-h-screen bg-dark-primary">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Home / Landing */}
          <Route path="/" element={<Home />} />

          {/* Host Routes */}
          <Route
            path="/host"
            element={
              hostShouldBeInGame ? (
                <Navigate to={`/host/${gameState.code}`} replace />
              ) : (
                <HostLobby />
              )
            }
          />
          <Route
            path="/host/:code"
            element={
              hostShouldBeInLobby ? (
                <Navigate to="/host" replace />
              ) : hostShouldBeInGame ? (
                <HostGame />
              ) : (
                <Navigate to="/host" replace />
              )
            }
          />

          {/* Player Routes */}
          <Route path="/join" element={<PlayerJoin />} />
          <Route path="/join/:code" element={<PlayerJoin />} />
          <Route
            path="/play/:code"
            element={
              player && gameState ? (
                <PlayerGame />
              ) : (
                <Navigate to="/join" replace />
              )
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default App
