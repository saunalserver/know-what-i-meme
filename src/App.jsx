import { Routes, Route, Navigate } from 'react-router-dom'
import { useGame } from './context/GameContext'

// Pages
import Home from './pages/Home'
import HostLobby from './pages/HostLobby'
import HostGame from './pages/HostGame'
import PlayerJoin from './pages/PlayerJoin'
import PlayerGame from './pages/PlayerGame'

function App() {
  const { gameState, isHost, player } = useGame()

  // Host should be on HostLobby during lobby phase, HostGame during game
  const hostShouldBeInLobby = isHost && gameState && gameState.phase === 'lobby'
  const hostShouldBeInGame = isHost && gameState && gameState.phase !== 'lobby'

  return (
    <div className="min-h-screen bg-dark-primary">
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
    </div>
  )
}

export default App
