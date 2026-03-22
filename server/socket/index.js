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

    // Host rejoins after reconnect (updates hostId to new socket.id)
    socket.on('host:rejoin', ({ code }) => {
      try {
        code = code.toUpperCase();

        if (!gameStore.hasRoom(code)) {
          return socket.emit('room:error', { message: 'Room not found' });
        }

        const room = gameStore.getRoom(code);

        // Update the host's socket ID to the new one
        const oldHostId = room.hostId;
        room.hostId = socket.id;
        currentRoom = code;
        isHost = true;
        socket.join(code);

        console.log(`🔄 Host rejoined room ${code}: ${oldHostId} -> ${socket.id}`);
        socket.emit('room:created', { code, gameState: room.toJSON() });
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Host creates a new room
    socket.on('host:create', () => {
      console.log(`🏠 host:create received from ${socket.id}`);
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
    socket.on('player:join', ({ code, name, photo }) => {
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

        // Add player with photo
        const player = room.addPlayer(socket.id, name, photo);
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
        console.log(`🎯 host:start received - isHost: ${isHost}, currentRoom: ${currentRoom}, rounds: ${rounds}`);

        if (!isHost || !currentRoom) {
          return socket.emit('room:error', { message: 'Only the host can start the game' });
        }

        const room = gameStore.getRoom(currentRoom);

        if (room.players.length < 2) {
          return socket.emit('room:error', { message: 'Need at least 2 players to start' });
        }

        room.startGame(rounds || 3);

        const state = room.toJSON();
        console.log(`📤 Emitting game:state - phase: ${state.phase}, promptOptions:`, state.currentPromptOptions);

        io.to(currentRoom).emit('game:state', state);
        io.to(currentRoom).emit('game:phase', { phase: room.phase });

        // Start the prompt vote timer
        room.startTimer('prompt_vote', io, currentRoom);

        console.log(`🎮 Game started in room ${currentRoom} with ${room.players.length} players`);
      } catch (error) {
        console.error(`❌ Error in host:start:`, error);
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
          console.log(`❌ Vote rejected: invalid`);
          return socket.emit('room:error', { message: 'Invalid vote' });
        }

        console.log(`✅ Vote accepted from ${socket.id} for prompt ${promptIndex}`);

        // Notify everyone of the vote
        io.to(currentRoom).emit('game:state', room.toJSON());

        // Check if all voted - stop timer and advance
        if (room.allPlayersVotedForPrompt()) {
          room.stopTimer();
          room.getWinningPrompt();
          room.phase = 'gif_search';
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: 'gif_search' });
          room.startTimer('gif_search', io, currentRoom);
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

        // Check if all submitted - stop timer and advance
        if (room.allPlayersSubmitted()) {
          room.stopTimer();
          room.phase = 'presentation';
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: 'presentation' });
          room.startPresentationTimer(io, currentRoom);
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

        // Stop auto-advance timer (manual override)
        room.stopTimer();

        room.presentationIndex++;

        if (room.presentationIndex >= room.players.length) {
          // All memes shown, move to voting and start timer
          room.phase = 'voting';
          room.presentationIndex = 0;
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: 'voting' });
          room.startTimer('voting', io, currentRoom);
        } else {
          io.to(currentRoom).emit('game:state', room.toJSON());
          // Restart presentation timer for next meme
          room.startPresentationTimer(io, currentRoom);
        }
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
          return socket.emit('room:error', { message: 'Cannot vote for yourself' });
        }

        // Notify everyone
        io.to(currentRoom).emit('game:state', room.toJSON());

        // Check if all voted - stop timer and show results
        if (room.allPlayersVoted()) {
          room.stopTimer();
          const results = room.calculateRoundResults();
          room.phase = 'round_results';
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: 'round_results' });
          io.to(currentRoom).emit('round:results', { results });
          room.startRoundResultsTimer(io, currentRoom);
          console.log(`🏆 Room ${currentRoom}: Round ${room.currentRound} complete`);
        }
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Host resets the game (back to lobby with same players)
    socket.on('host:reset', () => {
      try {
        if (!isHost || !currentRoom) return;

        const room = gameStore.getRoom(currentRoom);
        if (!room) return;

        // Stop any running timer
        room.stopTimer();

        // Reset game state but keep players
        room.phase = 'lobby';
        room.currentRound = 0;
        room.currentPrompt = null;
        room.currentPromptOptions = [];
        room.promptVotes.clear();
        room.submissions.clear();
        room.votes.clear();
        room.presentationIndex = 0;

        // Reset player states
        room.players.forEach(p => {
          p.currentGif = null;
          p.hasVoted = false;
          p.hasSubmitted = false;
          p.promptVote = null;
          // Keep scores or reset? Let's reset for a fresh game
          p.score = 0;
        });

        io.to(currentRoom).emit('game:state', room.toJSON());
        io.to(currentRoom).emit('game:phase', { phase: 'lobby' });
        console.log(`🔄 Room ${currentRoom}: Game reset to lobby`);
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Host restarts the game with same players (skip lobby, start immediately)
    socket.on('host:restart', ({ rounds, roomCode }) => {
      try {
        const targetRoom = roomCode || currentRoom;

        if (!targetRoom) {
          return socket.emit('room:error', { message: 'No room specified' });
        }

        const room = gameStore.getRoom(targetRoom);
        if (!room) {
          return socket.emit('room:error', { message: 'Room not found' });
        }

        // Verify this socket is the host (check room.hostId instead of closure variable)
        if (room.hostId !== socket.id) {
          return socket.emit('room:error', { message: 'Only the host can restart the game' });
        }

        // Stop any running timer
        room.stopTimer();

        // Reset player states and scores
        room.players.forEach(p => {
          p.currentGif = null;
          p.hasVoted = false;
          p.hasSubmitted = false;
          p.promptVote = null;
          p.score = 0;
        });

        // Start the game
        room.startGame(rounds || room.totalRounds);

        io.to(targetRoom).emit('game:state', room.toJSON());
        io.to(targetRoom).emit('game:phase', { phase: room.phase });
        room.startTimer('prompt_vote', io, targetRoom);
        console.log(`🔄 Room ${targetRoom}: Game restarted with ${room.players.length} players`);
      } catch (error) {
        socket.emit('room:error', { message: error.message });
      }
    });

    // Host advances to next round or final results
    socket.on('host:next', () => {
      try {
        if (!isHost || !currentRoom) return;

        const room = gameStore.getRoom(currentRoom);
        if (room.phase !== 'round_results' && room.phase !== 'leaderboard') return;

        // Stop auto-advance timer (manual override)
        room.stopTimer();

        // If showing leaderboard, advance to next round
        if (room.phase === 'leaderboard') {
          room.currentRound++;
          room.phase = 'prompt_vote';
          room.preparePromptVoting();
          io.to(currentRoom).emit('game:state', room.toJSON());
          io.to(currentRoom).emit('game:phase', { phase: room.phase });
          room.startTimer('prompt_vote', io, currentRoom);
          console.log(`🔄 Room ${currentRoom}: Starting round ${room.currentRound}`);
          return;
        }

        if (room.currentRound >= room.totalRounds) {
          // Game over
          room.phase = 'final_results';
        } else if (room.shouldShowLeaderboard()) {
          // Show leaderboard every 3 rounds for games with 5+ rounds
          room.phase = 'leaderboard';
        } else {
          // Next round
          room.currentRound++;
          room.phase = 'prompt_vote';
          room.preparePromptVoting();
        }

        io.to(currentRoom).emit('game:state', room.toJSON());
        io.to(currentRoom).emit('game:phase', { phase: room.phase });

        if (room.phase === 'prompt_vote') {
          room.startTimer('prompt_vote', io, currentRoom);
          console.log(`🔄 Room ${currentRoom}: Starting round ${room.currentRound}`);
        } else if (room.phase === 'final_results') {
          console.log(`🎉 Room ${currentRoom}: Game complete!`);
        } else if (room.phase === 'leaderboard') {
          console.log(`📊 Room ${currentRoom}: Showing leaderboard at round ${room.currentRound}`);
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
            // Host disconnected - give grace period for reconnection (handles React StrictMode)
            // Only immediately delete if game is in progress
            if (room.phase !== 'lobby' && room.phase !== 'waiting') {
              io.to(currentRoom).emit('room:error', { message: 'Host disconnected. Game ended.' });
              gameStore.deleteRoom(currentRoom);
              console.log(`💀 Room ${currentRoom} deleted (host left during game)`);
            } else {
              // During lobby, wait 5 seconds before deleting (allows for React StrictMode reconnects)
              console.log(`⏳ Host disconnected from ${currentRoom}, waiting 5s before cleanup...`);
              setTimeout(() => {
                // Check if room still exists and host never reconnected
                const stillExists = gameStore.hasRoom(currentRoom);
                if (stillExists) {
                  const currentRoomState = gameStore.getRoom(currentRoom);
                  // If host is still the same (didn't reconnect), delete
                  if (currentRoomState && currentRoomState.hostId === socket.id) {
                    io.to(currentRoom).emit('room:error', { message: 'Host disconnected. Game ended.' });
                    gameStore.deleteRoom(currentRoom);
                    console.log(`💀 Room ${currentRoom} deleted (host didn't reconnect)`);
                  }
                }
              }, 5000);
            }
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
