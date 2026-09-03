import { gameStore, generateRoomCode } from '../data/gameStore.js';
import { GameRoom, MAX_PLAYERS } from '../game/GameRoom.js';

const MAX_NAME_LENGTH = 15;
// A downscaled selfie is ~30 KB of base64; anything much larger is rejected
// rather than rebroadcast to every client on every state update.
const MAX_PHOTO_BYTES = 400_000;
// How long the host has to come back before the room is torn down.
const HOST_GRACE_MS = 30_000;

function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

function sanitizePhoto(photo) {
  if (typeof photo !== 'string' || !photo) return null;
  if (photo.length > MAX_PHOTO_BYTES) return null;
  if (!/^(data:image\/|https?:\/\/)/i.test(photo)) return null;
  return photo;
}

function sanitizeCode(code) {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(upper) ? upper : null;
}

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    let currentRoom = null;
    let isHost = false;

    const fail = (message) => socket.emit('room:error', { message });

    // Resolve the room this socket belongs to, or report why it can't.
    const roomOrFail = () => {
      if (!currentRoom) return null;
      const room = gameStore.getRoom(currentRoom);
      if (!room) {
        fail('Room no longer exists');
        return null;
      }
      return room;
    };

    // Host actions are checked against the room's current host id rather than
    // this socket's closure flag, so a host that reconnected still counts.
    const hostRoomOrFail = () => {
      const room = roomOrFail();
      if (!room) return null;
      if (room.hostId !== socket.id) {
        fail('Only the host can do that');
        return null;
      }
      return room;
    };

    const broadcastState = (room) => {
      io.to(room.code).emit('game:state', room.toJSON());
    };

    const broadcastPlayers = (room) => {
      io.to(room.code).emit('players:update', {
        players: room.players.map(p => p.toJSON()),
        gameState: room.toJSON(),
      });
    };

    // ============================================
    // LOBBY HANDLERS
    // ============================================

    socket.on('host:create', () => {
      try {
        let code;
        do {
          code = generateRoomCode();
        } while (gameStore.hasRoom(code));

        const room = new GameRoom(code, socket.id);
        gameStore.createRoom(code, room);

        currentRoom = code;
        isHost = true;
        socket.join(code);

        socket.emit('room:created', { code, gameState: room.toJSON() });
        console.log(`🏠 Host ${socket.id} created room ${code}`);
      } catch (error) {
        fail(error.message);
      }
    });

    // Host reconnects (page refresh, laptop sleep) and takes the room back.
    socket.on('host:rejoin', ({ code } = {}) => {
      try {
        const roomCode = sanitizeCode(code);
        if (!roomCode || !gameStore.hasRoom(roomCode)) {
          return fail('Room not found');
        }

        const room = gameStore.getRoom(roomCode);
        const oldHostId = room.hostId;
        room.hostId = socket.id;
        room.touch();

        currentRoom = roomCode;
        isHost = true;
        socket.join(roomCode);

        console.log(`🔄 Host rejoined room ${roomCode}: ${oldHostId} -> ${socket.id}`);
        socket.emit('room:created', { code: roomCode, gameState: room.toJSON() });
        broadcastState(room);
      } catch (error) {
        fail(error.message);
      }
    });

    socket.on('player:join', ({ code, name, photo } = {}) => {
      try {
        const roomCode = sanitizeCode(code);
        if (!roomCode || !gameStore.hasRoom(roomCode)) {
          return fail('Room not found');
        }

        const room = gameStore.getRoom(roomCode);

        if (room.phase !== 'lobby') {
          return fail('Game already in progress');
        }

        const playerName = sanitizeName(name);
        if (!playerName) return fail('Please enter a name');

        if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
          return fail('Name already taken');
        }

        if (room.players.length >= MAX_PLAYERS) {
          return fail('Room is full');
        }

        const player = room.addPlayer(socket.id, playerName, sanitizePhoto(photo));
        currentRoom = roomCode;
        isHost = false;
        socket.join(roomCode);

        socket.emit('room:joined', {
          player: player.toJSON(),
          gameState: room.toJSON(),
        });
        broadcastPlayers(room);

        console.log(`👋 Player "${playerName}" joined room ${roomCode}`);
      } catch (error) {
        fail(error.message);
      }
    });

    // Player reconnects and reclaims their seat, score and submission.
    socket.on('player:rejoin', ({ code, playerId } = {}) => {
      try {
        const roomCode = sanitizeCode(code);
        if (!roomCode || !gameStore.hasRoom(roomCode)) {
          return fail('Room not found');
        }

        const room = gameStore.getRoom(roomCode);
        const player = room.players.find(p => p.id === playerId);
        if (!player) {
          return fail('Player not found in room');
        }

        const oldId = player.id;
        player.markConnected(socket.id);

        // Re-key anything stored under the old socket id.
        if (room.submissions.has(oldId)) {
          room.submissions.set(socket.id, room.submissions.get(oldId));
          room.submissions.delete(oldId);
        }
        if (room.votes.has(oldId)) {
          room.votes.set(socket.id, room.votes.get(oldId));
          room.votes.delete(oldId);
        }
        for (const [voterId, targetId] of room.votes.entries()) {
          if (targetId === oldId) room.votes.set(voterId, socket.id);
        }
        room.presentationOrder = room.presentationOrder.map(id => (id === oldId ? socket.id : id));
        room.touch();

        currentRoom = roomCode;
        isHost = false;
        socket.join(roomCode);

        console.log(`🔄 Player "${player.name}" rejoined ${roomCode}: ${oldId} -> ${socket.id}`);

        socket.emit('room:joined', {
          player: player.toJSON(),
          gameState: room.toJSON(),
        });
        broadcastPlayers(room);
      } catch (error) {
        fail(error.message);
      }
    });

    // ============================================
    // GAME FLOW HANDLERS
    // ============================================

    socket.on('host:start', ({ rounds } = {}) => {
      try {
        const room = hostRoomOrFail();
        if (!room) return;

        if (room.players.length < 2) {
          return fail('Need at least 2 players to start');
        }

        room.startGame(rounds);
        room.enterPhase('prompt_vote', io, room.code);

        console.log(`🎮 Game started in room ${room.code} with ${room.players.length} players`);
      } catch (error) {
        console.error('❌ Error in host:start:', error);
        fail(error.message);
      }
    });

    socket.on('player:vote-prompt', ({ promptIndex } = {}) => {
      try {
        const room = roomOrFail();
        if (!room || isHost) return;
        if (room.phase !== 'prompt_vote') {
          return fail('Not in prompt voting phase');
        }

        if (!room.voteForPrompt(socket.id, promptIndex)) {
          return fail('Invalid vote');
        }

        broadcastState(room);

        if (room.allPlayersVotedForPrompt()) {
          room.stopTimer();
          room.resolvePromptVote();
          room.enterPhase('gif_search', io, room.code);
          console.log(`📝 Room ${room.code}: All voted, moving to GIF search`);
        }
      } catch (error) {
        fail(error.message);
      }
    });

    socket.on('player:submit-gif', ({ gifUrl } = {}) => {
      try {
        const room = roomOrFail();
        if (!room || isHost) return;
        if (room.phase !== 'gif_search') {
          return fail('Not in GIF search phase');
        }

        if (!room.submitGif(socket.id, gifUrl)) {
          return fail('That GIF could not be submitted');
        }

        broadcastState(room);

        if (room.allPlayersSubmitted()) {
          room.stopTimer();
          room.enterPhase('presentation', io, room.code);
          console.log(`🖼️ Room ${room.code}: All GIFs in, starting presentation`);
        }
      } catch (error) {
        fail(error.message);
      }
    });

    socket.on('host:advance-presentation', () => {
      try {
        const room = hostRoomOrFail();
        if (!room || room.phase !== 'presentation') return;
        // Manual advance overrides the auto-advance timer.
        room.advancePresentation(io, room.code);
      } catch (error) {
        fail(error.message);
      }
    });

    socket.on('player:cast-vote', ({ targetId } = {}) => {
      try {
        const room = roomOrFail();
        if (!room || isHost) return;
        if (room.phase !== 'voting') {
          return fail('Not in voting phase');
        }

        if (!room.castVote(socket.id, targetId)) {
          return fail('You cannot vote for that meme');
        }

        broadcastState(room);

        if (room.allPlayersVoted()) {
          room.finishVoting(io, room.code);
          console.log(`🏆 Room ${room.code}: Round ${room.currentRound} complete`);
        }
      } catch (error) {
        fail(error.message);
      }
    });

    socket.on('host:reset', () => {
      try {
        const room = hostRoomOrFail();
        if (!room) return;

        room.resetToLobby();
        broadcastState(room);
        io.to(room.code).emit('game:phase', { phase: 'lobby' });
        console.log(`🔄 Room ${room.code}: Reset to lobby`);
      } catch (error) {
        fail(error.message);
      }
    });

    // Play again with the same players, skipping the lobby.
    socket.on('host:restart', ({ rounds } = {}) => {
      try {
        const room = hostRoomOrFail();
        if (!room) return;

        if (room.players.length < 2) {
          return fail('Need at least 2 players to start');
        }

        room.startGame(rounds || room.totalRounds);
        room.enterPhase('prompt_vote', io, room.code);
        console.log(`🔄 Room ${room.code}: Restarted with ${room.players.length} players`);
      } catch (error) {
        fail(error.message);
      }
    });

    socket.on('host:next', () => {
      try {
        const room = hostRoomOrFail();
        if (!room) return;
        if (room.phase !== 'round_results' && room.phase !== 'leaderboard') return;

        room.advanceAfterResults(io, room.code);
      } catch (error) {
        fail(error.message);
      }
    });

    // ============================================
    // DISCONNECT
    // ============================================

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      if (!currentRoom) return;

      const room = gameStore.getRoom(currentRoom);
      if (!room) return;

      // A host that already reconnected owns the room under a new socket id;
      // this is just the old socket timing out, and must not end the game.
      if (isHost) {
        if (room.hostId !== socket.id) return;
        scheduleHostCleanup(io, currentRoom, socket.id);
        return;
      }

      const player = room.getPlayer(socket.id);
      if (!player) return;

      if (room.phase === 'lobby') {
        // Nothing to preserve before the game starts.
        room.removePlayer(socket.id);
        console.log(`👋 ${player.name} left the lobby of ${room.code}`);
      } else {
        // Mid-game: keep their seat, score and submission and let the round
        // continue without waiting on them.
        player.markDisconnected();
        console.log(`📴 ${player.name} dropped out of ${room.code} (seat kept)`);
        advanceIfEveryoneIsReady(io, room);
      }

      broadcastPlayers(room);
    });
  });
}

// A player leaving used to strand the round: the "has everyone finished?"
// checks only ran when someone acted, so the room waited out the full timer.
function advanceIfEveryoneIsReady(io, room) {
  if (room.phase === 'prompt_vote' && room.allPlayersVotedForPrompt()) {
    room.stopTimer();
    room.resolvePromptVote();
    room.enterPhase('gif_search', io, room.code);
  } else if (room.phase === 'gif_search' && room.allPlayersSubmitted()) {
    room.stopTimer();
    room.enterPhase('presentation', io, room.code);
  } else if (room.phase === 'voting' && room.allPlayersVoted()) {
    room.finishVoting(io, room.code);
  }
}

// Give a disconnected host a window to come back before ending the game --
// a refresh of the big screen shouldn't cost everyone their scores.
function scheduleHostCleanup(io, code, hostSocketId) {
  console.log(`⏳ Host of ${code} disconnected, waiting ${HOST_GRACE_MS / 1000}s...`);

  setTimeout(() => {
    const room = gameStore.getRoom(code);
    if (!room) return;
    // Reconnected under a new socket id: nothing to do.
    if (room.hostId !== hostSocketId) return;

    io.to(code).emit('room:error', { message: 'Host disconnected. Game ended.' });
    gameStore.deleteRoom(code);
    console.log(`💀 Room ${code} deleted (host never came back)`);
  }, HOST_GRACE_MS).unref?.();
}

export default setupSocketHandlers;
