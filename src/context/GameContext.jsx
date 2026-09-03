import { createContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { socket, connectSocket } from '../services/socket';
import { loadSession, savePlayerSession, saveHostSession, clearSession } from '../utils/session';

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

// Phases the server runs a countdown for; anything else clears the display.
const TIMED_PHASES = [
  'prompt_vote',
  'gif_search',
  'voting',
  'presentation',
  'round_results',
  'leaderboard',
];

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };

    case 'SET_HOST':
      return {
        ...state,
        isHost: true,
        error: null,
        roomCode: action.payload.code,
        gameState: action.payload.gameState || state.gameState,
      };

    case 'SET_PLAYER':
      return {
        ...state,
        isHost: false,
        error: null,
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

    case 'LEAVE_GAME':
      return { ...initialState, isConnected: state.isConnected };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  // Read by the socket callbacks without making them re-subscribe.
  const roomCodeRef = useRef(null);
  const inGameRef = useRef(false);
  roomCodeRef.current = state.roomCode;
  inGameRef.current = Boolean(state.gameState);

  // Connect socket on mount
  useEffect(() => {
    connectSocket();

    const handleConnect = () => dispatch({ type: 'SET_CONNECTED', payload: true });
    const handleDisconnect = () => dispatch({ type: 'SET_CONNECTED', payload: false });

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
      dispatch({ type: 'SET_CONNECTED', payload: true });
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      // The socket is a singleton; leave it connected across route changes.
    };
  }, []);

  // Game event listeners. These are registered once: re-subscribing on every
  // state change (as this used to) meant events could land between the
  // teardown and setup of a handler and be dropped.
  useEffect(() => {
    const handleRoomCreated = ({ code, gameState }) => {
      saveHostSession(code);
      dispatch({ type: 'SET_HOST', payload: { code, gameState } });
    };

    const handleRoomJoined = ({ player, gameState }) => {
      savePlayerSession(gameState.code, player.id);
      dispatch({ type: 'SET_PLAYER', payload: { player, gameState } });
    };

    const handleRoomError = ({ message }) => {
      // An error before we're in a game means the saved session is stale
      // (room gone, game already started) -- drop it so we stop retrying.
      if (!inGameRef.current) clearSession();
      dispatch({ type: 'SET_ERROR', payload: message });
    };

    const handleGameState = (gameState) => {
      dispatch({ type: 'SET_GAME_STATE', payload: gameState });
    };

    const handlePhaseChange = ({ phase }) => {
      if (!TIMED_PHASES.includes(phase)) {
        dispatch({ type: 'CLEAR_TIMER' });
      }
      if (phase === 'prompt_vote') {
        // Results belong to the round that just ended.
        dispatch({ type: 'SET_ROUND_RESULTS', payload: null });
      }
    };

    const handlePlayersUpdate = ({ players, gameState }) => {
      if (gameState) {
        dispatch({ type: 'SET_GAME_STATE', payload: gameState });
      } else {
        dispatch({ type: 'UPDATE_PLAYERS', payload: { players } });
      }
    };

    const handleRoundResults = ({ results }) => {
      dispatch({ type: 'SET_ROUND_RESULTS', payload: results });
    };

    const handleTimerUpdate = (timerData) => {
      dispatch({ type: 'SET_TIMER', payload: timerData });
    };

    socket.on('room:created', handleRoomCreated);
    socket.on('room:joined', handleRoomJoined);
    socket.on('room:error', handleRoomError);
    socket.on('game:state', handleGameState);
    socket.on('game:phase', handlePhaseChange);
    socket.on('players:update', handlePlayersUpdate);
    socket.on('round:results', handleRoundResults);
    socket.on('timer:update', handleTimerUpdate);

    return () => {
      socket.off('room:created', handleRoomCreated);
      socket.off('room:joined', handleRoomJoined);
      socket.off('room:error', handleRoomError);
      socket.off('game:state', handleGameState);
      socket.off('game:phase', handlePhaseChange);
      socket.off('players:update', handlePlayersUpdate);
      socket.off('round:results', handleRoundResults);
      socket.off('timer:update', handleTimerUpdate);
    };
  }, []);

  // Reclaim the room after a reconnect (wifi blip, phone waking up).
  useEffect(() => {
    if (!state.isConnected) return;

    const session = loadSession();
    if (!session) return;

    // Already in this room under the current connection.
    if (roomCodeRef.current === session.code && state.gameState) return;

    if (session.role === 'host') {
      socket.emit('host:rejoin', { code: session.code });
    } else if (session.playerId) {
      socket.emit('player:rejoin', { code: session.code, playerId: session.playerId });
    }
    // Only when the connection comes back, not on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isConnected]);

  // Emit once connected, queuing the call if the socket is still handshaking.
  const emitWhenReady = useCallback((event, payload) => {
    if (socket.connected) {
      socket.emit(event, payload);
    } else {
      socket.once('connect', () => socket.emit(event, payload));
      connectSocket();
    }
  }, []);

  const createRoom = useCallback(() => emitWhenReady('host:create'), [emitWhenReady]);

  const joinRoom = useCallback(
    (code, name, photo = null) => emitWhenReady('player:join', { code, name, photo }),
    [emitWhenReady]
  );

  const rejoinRoom = useCallback(
    (code, playerId) => emitWhenReady('player:rejoin', { code, playerId }),
    [emitWhenReady]
  );

  const startGame = useCallback((rounds = 3) => emitWhenReady('host:start', { rounds }), [emitWhenReady]);
  const votePrompt = useCallback((promptIndex) => emitWhenReady('player:vote-prompt', { promptIndex }), [emitWhenReady]);
  const submitGif = useCallback((gifUrl) => emitWhenReady('player:submit-gif', { gifUrl }), [emitWhenReady]);
  const castVote = useCallback((targetId) => emitWhenReady('player:cast-vote', { targetId }), [emitWhenReady]);
  const advancePresentation = useCallback(() => emitWhenReady('host:advance-presentation'), [emitWhenReady]);
  const nextRound = useCallback(() => emitWhenReady('host:next'), [emitWhenReady]);
  const resetGame = useCallback(() => emitWhenReady('host:reset'), [emitWhenReady]);
  const restartGame = useCallback((rounds) => emitWhenReady('host:restart', { rounds }), [emitWhenReady]);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  // Drop the saved session and go back to a blank slate.
  const leaveGame = useCallback(() => {
    clearSession();
    dispatch({ type: 'LEAVE_GAME' });
  }, []);

  const value = {
    ...state,
    createRoom,
    joinRoom,
    rejoinRoom,
    startGame,
    votePrompt,
    submitGif,
    castVote,
    advancePresentation,
    nextRound,
    resetGame,
    restartGame,
    clearError,
    leaveGame,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export default GameContext;
