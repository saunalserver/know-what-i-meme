import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { socket, connectSocket } from '../services/socket';

const GameContext = createContext(null);

const initialState = {
  isConnected: false,
  isHost: false,
  roomCode: null,
  player: null,
  gameState: null,
  error: null,
  roundResults: null,
  timer: null, // { phase, seconds, total }
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };

    case 'SET_HOST':
      return {
        ...state,
        isHost: true,
        roomCode: action.payload.code,
        gameState: action.payload.gameState || state.gameState,
      };

    case 'SET_PLAYER':
      return {
        ...state,
        isHost: false,
        player: action.payload.player,
        roomCode: action.payload.gameState?.code,
        gameState: action.payload.gameState,
      };

    case 'SET_GAME_STATE':
      return { ...state, gameState: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SET_ROUND_RESULTS':
      return { ...state, roundResults: action.payload };

    case 'UPDATE_PLAYERS':
      return {
        ...state,
        gameState: state.gameState
          ? { ...state.gameState, players: action.payload.players }
          : null,
      };

    case 'SET_TIMER':
      return { ...state, timer: action.payload };

    case 'CLEAR_TIMER':
      return { ...state, timer: null };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Connect socket on mount
  useEffect(() => {
    connectSocket();

    const handleConnect = () => {
      dispatch({ type: 'SET_CONNECTED', payload: true });
      console.log('✅ Connected to server');
    };

    const handleDisconnect = () => {
      dispatch({ type: 'SET_CONNECTED', payload: false });
      console.log('❌ Disconnected from server');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Check if already connected
    if (socket.connected) {
      dispatch({ type: 'SET_CONNECTED', payload: true });
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      // Don't disconnect the socket on cleanup - it's a singleton
    };
  }, []);

  // Game event listeners
  useEffect(() => {
    const handleRoomCreated = ({ code, gameState }) => {
      console.log('🏠 Room created:', code, 'gameState:', gameState?.phase);
      dispatch({ type: 'SET_HOST', payload: { code, gameState } });
    };

    const handleRoomJoined = ({ player, gameState }) => {
      console.log('👋 Room joined:', player.name);
      dispatch({ type: 'SET_PLAYER', payload: { player, gameState } });
    };

    const handleRoomError = ({ message }) => {
      console.error('❌ Room error:', message);
      dispatch({ type: 'SET_ERROR', payload: message });
    };

    const handleGameState = (gameState) => {
      console.log('🎮 Game state updated:', gameState.phase);
      dispatch({ type: 'SET_GAME_STATE', payload: gameState });
    };

    const handlePhaseChange = ({ phase }) => {
      console.log('Phase changed:', phase);
    };

    const handlePlayersUpdate = ({ players, gameState }) => {
      // If server sends full gameState, use it; otherwise merge players
      if (gameState) {
        dispatch({ type: 'SET_GAME_STATE', payload: gameState });
      } else {
        dispatch({
          type: 'UPDATE_PLAYERS',
          payload: { players },
        });
      }
    };

    const handleRoundResults = ({ results }) => {
      dispatch({ type: 'SET_ROUND_RESULTS', payload: results });
    };

    const handleTimerUpdate = (timerData) => {
      dispatch({ type: 'SET_TIMER', payload: timerData });
    };

    // Clear timer when phase changes to something without a timer
    const handlePhaseChangeWithTimer = ({ phase }) => {
      console.log('Phase changed:', phase);
      if (!['prompt_vote', 'gif_search', 'voting', 'presentation', 'round_results'].includes(phase)) {
        dispatch({ type: 'CLEAR_TIMER' });
      }
    };

    socket.on('room:created', handleRoomCreated);
    socket.on('room:joined', handleRoomJoined);
    socket.on('room:error', handleRoomError);
    socket.on('game:state', handleGameState);
    socket.on('game:phase', handlePhaseChangeWithTimer);
    socket.on('players:update', handlePlayersUpdate);
    socket.on('round:results', handleRoundResults);
    socket.on('timer:update', handleTimerUpdate);

    return () => {
      socket.off('room:created', handleRoomCreated);
      socket.off('room:joined', handleRoomJoined);
      socket.off('room:error', handleRoomError);
      socket.off('game:state', handleGameState);
      socket.off('game:phase', handlePhaseChangeWithTimer);
      socket.off('players:update', handlePlayersUpdate);
      socket.off('round:results', handleRoundResults);
      socket.off('timer:update', handleTimerUpdate);
    };
  }, [state.gameState]);

  // Actions - ensure socket is connected before emitting
  const createRoom = useCallback(() => {
    console.log('🏠 createRoom called, socket.connected:', socket.connected);
    if (!socket.connected) {
      console.log('⏳ Socket not connected, waiting...');
      socket.once('connect', () => {
        console.log('🔌 Now connected, creating room...');
        socket.emit('host:create');
      });
      connectSocket();
    } else {
      console.log('🏠 Creating room...');
      socket.emit('host:create');
    }
  }, []);

  const joinRoom = useCallback((code, name, photo = null) => {
    if (!socket.connected) {
      socket.once('connect', () => {
        socket.emit('player:join', { code, name, photo });
      });
      connectSocket();
    } else {
      socket.emit('player:join', { code, name, photo });
    }
  }, []);

  const startGame = useCallback((rounds = 3) => {
    if (socket.connected) {
      socket.emit('host:start', { rounds });
    }
  }, []);

  const votePrompt = useCallback((promptIndex) => {
    if (socket.connected) {
      socket.emit('player:vote-prompt', { promptIndex });
    }
  }, []);

  const submitGif = useCallback((gifUrl) => {
    if (socket.connected) {
      socket.emit('player:submit-gif', { gifUrl });
    }
  }, []);

  const castVote = useCallback((targetId) => {
    if (socket.connected) {
      socket.emit('player:cast-vote', { targetId });
    }
  }, []);

  const advancePresentation = useCallback(() => {
    if (socket.connected) {
      socket.emit('host:advance-presentation');
    }
  }, []);

  const nextRound = useCallback(() => {
    if (socket.connected) {
      socket.emit('host:next');
    }
  }, []);

  const resetGame = useCallback(() => {
    if (socket.connected) {
      socket.emit('host:reset');
    }
  }, []);

  const restartGame = useCallback((rounds) => {
    if (socket.connected) {
      socket.emit('host:restart', { rounds, roomCode: state.roomCode });
    }
  }, [state.roomCode]);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const value = {
    ...state,
    createRoom,
    joinRoom,
    startGame,
    votePrompt,
    submitGif,
    castVote,
    advancePresentation,
    nextRound,
    resetGame,
    restartGame,
    clearError,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

export default GameContext;
