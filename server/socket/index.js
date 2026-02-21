import { gameStore, generateRoomCode } from '../data/gameStore.js';
import { GameRoom } from '../game/GameRoom.js';

export function setupSocketHandlers(io) {
  // Log all incoming connections
  io.engine.on('connection', (socket) => {
    console.log(`🌐 Raw connection attempt from: ${socket.request?.connection?.remoteAddress}`);
  });

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id} from ${socket.handshake?.address}`);

    let currentRoom = null;
    let isHost = false;

    // ============================================
    // LOBBY HANDLERS
    // ============================================

    // Host creates a new room
    socket.on('host:create', () => {
      try {
        // Generate unique room code
        let code;
        do {
          code = generateRoomCode();
        } while (gameStore.hasRoom(code));

        // Create room
        const room = new GameRoom(code, socket.id);
        gameStore.createRoom(code, room);

        currentRoom = code;
        isHost = true;
        socket.join(code);

        const roomState = room.toJSON();
        socket.emit('room:created', { code, gameState: roomState });
        console.log(`🏠 Host ${socket.id} created room ${code}`);
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Player joins an existing room
    socket.on('player:join', ({ code, name }) => {
      try {
        code = code.toUpperCase();

        if (!gameStore.hasRoom(code)) {
          return socket.emit('room:error', { message: 'Room not found' });
        }

        const room = gameStore.getRoom(code);

        if (room.phase !== 'lobby' && room.phase !== 'waiting') {
          return socket.emit('room:error', { message: 'Game already in progress' });
        }

        // Check for duplicate names
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
          return socket.emit('room:error', { message: 'Name already taken' });
        }

        // Check max players
        if (room.players.length >= 9) {
          return socket.emit('room:error', { message: 'Room is full' });
        }

        // Add player
        const player = room.addPlayer(socket.id, name);
        currentRoom = code;
        isHost = false;
        socket.join(code);

        socket.emit('room:joined', {
          player: player.toJSON(),
          gameState: room.toJSON(),
        });

        // Notify everyone of new player
        io.to(code).emit('players:update', {
          players: room.players.map(p => p.toJSON()),
          gameState: room.toJSON(),
        });

        console.log(`👋 Player "${name}" joined room ${code}`);
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // ============================================
    // GAME FLOW HANDLERS
    // ============================================

    // Host starts the game
    socket.on('host:start', ({ rounds }) => {
      try {
        if (!isHost || !currentRoom) {
          return socket.emit('room:error', { message: 'Only the host can start the game' });
        }

        const room = gameStore.getRoom(currentRoom);

        if (room.players.length < 2) {
          return socket.emit('room:error', { message: 'Need at least 2 players to start' });
        }

        room.startGame(rounds || 3);

        io.to(currentRoom).emit('game:state', room.toJSON());
        io.to(currentRoom).emit('game:phase', { phase: room.phase });

        console.log(`🎮 Game started in room ${currentRoom} with ${room.players.length} players`);
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Player votes for a prompt
    socket.on('player:vote-prompt', ({ promptIndex }) => {
      console.log(`🗳️ Vote received from ${socket.id}, currentRoom: ${currentRoom}, isHost: ${isHost}`);
      try {
        if (!currentRoom || isHost) {
          console.log(`❌ Vote rejected: no room or is host`);
          return;
        }

        const room = gameStore.getRoom(currentRoom);
        if (room.phase !== 'prompt_vote') {
          console.log(`❌ Vote rejected: wrong phase (${room.phase})`);
          return socket.emit('room:error', { message: 'Not in prompt voting phase' });
        }

        const success = room.voteForPrompt(socket.id, promptIndex);
        if (!success) {
          console.log(`❌ Vote rejected: already voted`);
          return socket.emit('room:error', { message: 'Already voted' });
        }

        console.log(`✅ Vote accepted from ${socket.id} for prompt ${promptIndex}`);

        // Notify everyone of the vote
        io.to(currentRoom).emit('game:state', room.toJSON());

        // Check if all voted
        if (room.allPlayersVotedForPrompt()) {
          room.getWinningPrompt();
          room.phase = 'gif_search';
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: 'gif_search' });
          console.log(`📝 Room ${currentRoom}: All voted for prompt, moving to GIF search`);
        }
      } catch (error) {
        console.error(`❌ Vote error: ${error.message}`);
        socket.emit('room:error', { message: error.message });
      }
    });

    // Player submits their GIF
    socket.on('player:submit-gif', ({ gifUrl }) => {
      try {
        if (!currentRoom || isHost) return;

        const room = gameStore.getRoom(currentRoom);
        if (room.phase !== 'gif_search') {
          return socket.emit('room:error', { message: 'Not in GIF search phase' });
        }

        const success = room.submitGif(socket.id, gifUrl);
        if (!success) {
          return socket.emit('room:error', { message: 'Already submitted' });
        }

        // Notify everyone
        io.to(currentRoom).emit('game:state', room.toJSON());

        // Check if all submitted
        if (room.allPlayersSubmitted()) {
          room.phase = 'presentation';
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: 'presentation' });
          console.log(`🖼️ Room ${currentRoom}: All GIFs submitted, starting presentation`);
        }
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Host advances presentation
    socket.on('host:advance-presentation', () => {
      try {
        if (!isHost || !currentRoom) return;

        const room = gameStore.getRoom(currentRoom);
        if (room.phase !== 'presentation') return;

        room.presentationIndex++;

        if (room.presentationIndex >= room.players.length) {
          // All memes shown, move to voting
          room.phase = 'voting';
          room.presentationIndex = 0;
          io.to(currentRoom).emit('game:phase', { phase: 'voting' });
        }

        io.to(currentRoom).emit('game:state', room.toJSON());
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Player casts vote for best meme
    socket.on('player:cast-vote', ({ targetId }) => {
      try {
        if (!currentRoom || isHost) return;

        const room = gameStore.getRoom(currentRoom);
        if (room.phase !== 'voting') {
          return socket.emit('room:error', { message: 'Not in voting phase' });
        }

        const success = room.castVote(socket.id, targetId);
        if (!success) {
          return socket.emit('room:error', { message: 'Cannot vote (already voted or voting for yourself)' });
        }

        // Notify everyone
        io.to(currentRoom).emit('game:state', room.toJSON());

        // Check if all voted
        if (room.allPlayersVoted()) {
          const results = room.calculateRoundResults();
          room.phase = 'round_results';
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: 'round_results' });
          io.to(currentRoom).emit('round:results', { results });
          console.log(`🏆 Room ${currentRoom}: Round ${room.currentRound} complete`);
        }
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Host advances to next round or final results
    socket.on('host:next', () => {
      try {
        if (!isHost || !currentRoom) return;

        const room = gameStore.getRoom(currentRoom);
        if (room.phase !== 'round_results') return;

        if (room.currentRound >= room.totalRounds) {
          // Game over
          room.phase = 'final_results';
        } else {
          // Next round
          room.currentRound++;
          room.phase = 'prompt_vote';
          room.preparePromptVoting();
        }

        io.to(currentRoom).emit('game:state', room.toJSON());
        io.to(currentRoom).emit('game:phase', { phase: room.phase });

        if (room.phase === 'final_results') {
          console.log(`🎉 Room ${currentRoom}: Game complete!`);
        } else {
          console.log(`🔄 Room ${currentRoom}: Starting round ${room.currentRound}`);
        }
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // ============================================
    // DISCONNECT HANDLER
    // ============================================

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);

      if (currentRoom) {
        const room = gameStore.getRoom(currentRoom);
        if (room) {
          if (isHost) {
            // Host left - end game for everyone
            io.to(currentRoom).emit('room:error', { message: 'Host disconnected. Game ended.' });
            gameStore.deleteRoom(currentRoom);
            console.log(`💀 Room ${currentRoom} deleted (host left)`);
          } else {
            // Player left - remove from room
            room.removePlayer(socket.id);
            io.to(currentRoom).emit('players:update', { players: room.players.map(p => p.toJSON()) });
            io.to(currentRoom).emit('game:state', room.toJSON());
            console.log(`👋 Player left room ${currentRoom}`);
          }
        }
      }
    });
  });
}

export default setupSocketHandlers;
