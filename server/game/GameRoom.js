import { Player } from './Player.js';
import { getRandomPrompts, fillPlayerPlaceholders } from '../data/prompts.js';

// Fisher-Yates shuffle
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export class GameRoom {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = [];
    this.phase = 'lobby'; // lobby, waiting, prompt_vote, gif_search, presentation, voting, round_results, leaderboard, final_results
    this.currentRound = 0;
    this.totalRounds = 3;
    this.prompts = [];
    this.currentPrompt = null;
    this.currentPromptOptions = [];
    this.promptVotes = new Map(); // promptIndex -> count
    this.submissions = new Map(); // playerId -> gifUrl
    this.votes = new Map(); // voterId -> targetId
    this.presentationIndex = 0;
    this.presentationOrder = []; // Randomized player IDs for anonymous presentation
    this.createdAt = Date.now();

    // Timer state
    this.timerSeconds = 0;
    this.timerPhase = null; // Which phase the timer is for
  }

  // Timer durations in seconds
  static TIMER_DURATIONS = {
    prompt_vote: 30,
    gif_search: 60,
    voting: 30,
    presentation: 5,    // Per-meme auto-advance
    round_results: 8,   // Before next round
    leaderboard: 10,    // Mid-game leaderboard
  };

  startTimer(phase, io, roomCode) {
    this.timerPhase = phase;
    this.timerSeconds = GameRoom.TIMER_DURATIONS[phase] || 30;

    // Emit initial timer state
    io.to(roomCode).emit('timer:update', {
      phase,
      seconds: this.timerSeconds,
      total: GameRoom.TIMER_DURATIONS[phase] || 30
    });

    // Clear any existing interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Start countdown
    this.timerInterval = setInterval(() => {
      this.timerSeconds--;

      io.to(roomCode).emit('timer:update', {
        phase,
        seconds: this.timerSeconds,
        total: GameRoom.TIMER_DURATIONS[phase] || 30
      });

      if (this.timerSeconds <= 0) {
        this.handleTimerExpired(phase, io, roomCode);
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerSeconds = 0;
    this.timerPhase = null;
  }

  handleTimerExpired(phase, io, roomCode) {
    this.stopTimer();

    if (phase === 'prompt_vote') {
      // Force select winning prompt from current votes
      if (this.promptVotes.size > 0) {
        this.getWinningPrompt();
      } else {
        // No votes? Pick random
        this.currentPrompt = this.currentPromptOptions[Math.floor(Math.random() * 3)];
      }
      this.phase = 'gif_search';
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'gif_search' });
      this.startTimer('gif_search', io, roomCode);
    } else if (phase === 'gif_search') {
      // Submit empty GIF for players who haven't submitted
      this.players.forEach(p => {
        if (!p.hasSubmitted) {
          p.currentGif = 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif'; // Default "no GIF" placeholder
          p.hasSubmitted = true;
        }
      });
      this.phase = 'presentation';
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'presentation' });
    } else if (phase === 'voting') {
      // Calculate results with current votes
      const results = this.calculateRoundResults();
      this.phase = 'round_results';
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'round_results' });
      io.to(roomCode).emit('round:results', { results });
    } else if (phase === 'leaderboard') {
      // Auto-advance to next round from leaderboard
      this.currentRound++;
      this.phase = 'prompt_vote';
      this.preparePromptVoting();
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'prompt_vote' });
      this.startTimer('prompt_vote', io, roomCode);
      console.log(`🔄 Room ${roomCode}: Starting round ${this.currentRound} (auto from leaderboard)`);
    }
  }

  startPresentationTimer(io, roomCode) {
    this.timerPhase = 'presentation';
    this.timerSeconds = GameRoom.TIMER_DURATIONS.presentation;

    // Emit initial timer state
    io.to(roomCode).emit('timer:update', {
      phase: 'presentation',
      seconds: this.timerSeconds,
      total: GameRoom.TIMER_DURATIONS.presentation,
    });

    // Clear any existing interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Start countdown
    this.timerInterval = setInterval(() => {
      this.timerSeconds--;

      io.to(roomCode).emit('timer:update', {
        phase: 'presentation',
        seconds: this.timerSeconds,
        total: GameRoom.TIMER_DURATIONS.presentation,
      });

      if (this.timerSeconds <= 0) {
        this.handlePresentationTimerExpired(io, roomCode);
      }
    }, 1000);
  }

  handlePresentationTimerExpired(io, roomCode) {
    this.stopTimer();

    // Advance to next meme or voting phase
    this.presentationIndex++;

    if (this.presentationIndex >= this.players.length) {
      // All memes shown, move to voting
      this.phase = 'voting';
      this.presentationIndex = 0;
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'voting' });
      this.startTimer('voting', io, roomCode);
    } else {
      // Show next meme, restart presentation timer
      io.to(roomCode).emit('game:state', this.toJSON());
      this.startPresentationTimer(io, roomCode);
    }
  }

  startRoundResultsTimer(io, roomCode) {
    this.timerPhase = 'round_results';
    this.timerSeconds = GameRoom.TIMER_DURATIONS.round_results;

    // Emit initial timer state
    io.to(roomCode).emit('timer:update', {
      phase: 'round_results',
      seconds: this.timerSeconds,
      total: GameRoom.TIMER_DURATIONS.round_results,
    });

    // Clear any existing interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Start countdown
    this.timerInterval = setInterval(() => {
      this.timerSeconds--;

      io.to(roomCode).emit('timer:update', {
        phase: 'round_results',
        seconds: this.timerSeconds,
        total: GameRoom.TIMER_DURATIONS.round_results,
      });

      if (this.timerSeconds <= 0) {
        this.handleRoundResultsTimerExpired(io, roomCode);
      }
    }, 1000);
  }

  handleRoundResultsTimerExpired(io, roomCode) {
    this.stopTimer();

    // Determine next phase (same logic as host:next handler)
    if (this.currentRound >= this.totalRounds) {
      // Game over
      this.phase = 'final_results';
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'final_results' });
      console.log(`🎉 Room ${roomCode}: Game complete!`);
    } else if (this.shouldShowLeaderboard()) {
      // Show leaderboard every 3 rounds for games with 5+ rounds
      this.phase = 'leaderboard';
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'leaderboard' });
      this.startTimer('leaderboard', io, roomCode);
      console.log(`📊 Room ${roomCode}: Showing leaderboard at round ${this.currentRound}`);
    } else {
      // Next round
      this.currentRound++;
      this.phase = 'prompt_vote';
      this.preparePromptVoting();
      io.to(roomCode).emit('game:state', this.toJSON());
      io.to(roomCode).emit('game:phase', { phase: 'prompt_vote' });
      this.startTimer('prompt_vote', io, roomCode);
      console.log(`🔄 Room ${roomCode}: Starting round ${this.currentRound}`);
    }
  }

  // Check if we should show leaderboard (every 3 rounds for games with 5+ rounds)
  shouldShowLeaderboard() {
    return this.totalRounds >= 5 && this.currentRound > 0 && this.currentRound % 3 === 0;
  }

  getLeaderboard() {
    return [...this.players]
      .map(p => ({ id: p.id, name: p.name, score: p.score, color: p.color }))
      .sort((a, b) => b.score - a.score);
  }

  addPlayer(playerId, playerName, photo = null) {
    const player = new Player(playerId, playerName, photo);
    this.players.push(player);
    return player;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
    }
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  startGame(totalRounds = 3) {
    this.totalRounds = totalRounds;
    this.currentRound = 1;
    this.phase = 'prompt_vote';
    this.preparePromptVoting();
  }

  preparePromptVoting() {
    // Get raw prompts, then fill in player names
    const rawPrompts = getRandomPrompts(3, true); // includeEdgy = true
    this.currentPromptOptions = rawPrompts.map(prompt =>
      fillPlayerPlaceholders(prompt, this.players)
    );
    this.promptVotes.clear();
    // Initialize votes to 0
    this.currentPromptOptions.forEach((_, index) => {
      this.promptVotes.set(index, 0);
    });
    // Reset player round state
    this.players.forEach(p => p.resetForNewRound());
    this.submissions.clear();
    this.votes.clear();
    this.presentationIndex = 0;
    // Randomize presentation order for this round
    this.presentationOrder = shuffleArray(this.players.map(p => p.id));
  }

  voteForPrompt(playerId, promptIndex) {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    // If clicking the same prompt, deselect it
    if (player.promptVote === promptIndex) {
      // Remove previous vote from count
      const prevCount = this.promptVotes.get(promptIndex) || 0;
      this.promptVotes.set(promptIndex, Math.max(0, prevCount - 1));
      player.promptVote = null;
      return true;
    }

    // If already voted for a different prompt, switch vote
    if (player.promptVote !== null) {
      const prevCount = this.promptVotes.get(player.promptVote) || 0;
      this.promptVotes.set(player.promptVote, Math.max(0, prevCount - 1));
    }

    player.promptVote = promptIndex;
    const currentCount = this.promptVotes.get(promptIndex) || 0;
    this.promptVotes.set(promptIndex, currentCount + 1);
    return true;
  }

  allPlayersVotedForPrompt() {
    return this.players.every(p => p.promptVote !== null);
  }

  getWinningPrompt() {
    let maxVotes = 0;
    let winningIndex = 0;

    for (const [index, votes] of this.promptVotes.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        winningIndex = index;
      }
    }

    this.currentPrompt = this.currentPromptOptions[winningIndex];
    return this.currentPrompt;
  }

  submitGif(playerId, gifUrl) {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    // Allow changing GIF during the timer period
    // Just update the GIF URL (hasSubmitted stays true once they've submitted once)
    player.currentGif = gifUrl;
    player.hasSubmitted = true;
    this.submissions.set(playerId, gifUrl);
    return true;
  }

  allPlayersSubmitted() {
    return this.players.every(p => p.hasSubmitted);
  }

  castVote(voterId, targetId) {
    const voter = this.getPlayer(voterId);
    if (!voter) return false;
    if (voterId === targetId) return false; // Can't vote for yourself

    // Allow changing votes - just update the vote
    voter.hasVoted = true;
    this.votes.set(voterId, targetId);
    return true;
  }

  allPlayersVoted() {
    return this.players.every(p => p.hasVoted);
  }

  // Check if this is the final round
  isFinalRound() {
    return this.currentRound >= this.totalRounds;
  }

  // Get points multiplier (2x for final round)
  getPointsMultiplier() {
    return this.isFinalRound() ? 2 : 1;
  }

  calculateRoundResults() {
    const voteCounts = new Map();
    const voteBreakdown = new Map(); // targetId -> array of voters
    const multiplier = this.getPointsMultiplier();

    for (const [voterId, targetId] of this.votes.entries()) {
      const count = voteCounts.get(targetId) || 0;
      voteCounts.set(targetId, count + 1);

      // Track who voted for whom
      if (!voteBreakdown.has(targetId)) {
        voteBreakdown.set(targetId, []);
      }
      const voter = this.getPlayer(voterId);
      if (voter) {
        voteBreakdown.get(targetId).push({
          voterId,
          voterName: voter.name,
          voterColor: voter.color,
        });
      }
    }

    // Award points (with multiplier for final round)
    const results = [];
    for (const player of this.players) {
      const votesReceived = voteCounts.get(player.id) || 0;
      const pointsEarned = votesReceived * multiplier;
      if (pointsEarned > 0) {
        player.addScore(pointsEarned);
      }
      results.push({
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        playerPhoto: player.photo,
        gifUrl: player.currentGif,
        votesReceived,
        pointsEarned,
        multiplier,
        voters: voteBreakdown.get(player.id) || [],
      });
    }

    // Sort by votes
    results.sort((a, b) => b.votesReceived - a.votesReceived);
    return results;
  }

  nextPhase() {
    switch (this.phase) {
      case 'lobby':
        this.phase = 'waiting';
        break;
      case 'waiting':
        // Host must call startGame
        break;
      case 'prompt_vote':
        if (this.allPlayersVotedForPrompt()) {
          this.getWinningPrompt();
          this.phase = 'gif_search';
        }
        break;
      case 'gif_search':
        if (this.allPlayersSubmitted()) {
          this.phase = 'presentation';
        }
        break;
      case 'presentation':
        this.phase = 'voting';
        break;
      case 'voting':
        if (this.allPlayersVoted()) {
          this.phase = 'round_results';
        }
        break;
      case 'round_results':
        if (this.currentRound >= this.totalRounds) {
          this.phase = 'final_results';
        } else {
          this.currentRound++;
          this.phase = 'prompt_vote';
          this.preparePromptVoting();
        }
        break;
      case 'final_results':
        // Game over
        break;
    }
    return this.phase;
  }

  toJSON() {
    return {
      code: this.code,
      hostId: this.hostId,
      players: this.players.map(p => p.toJSON()),
      phase: this.phase,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      currentPrompt: this.currentPrompt,
      currentPromptOptions: this.currentPromptOptions,
      submissions: Object.fromEntries(this.submissions),
      votes: Object.fromEntries(this.votes),
      presentationIndex: this.presentationIndex,
      presentationOrder: this.presentationOrder,
      playerCount: this.players.length,
      isFinalRound: this.isFinalRound(),
      pointsMultiplier: this.getPointsMultiplier(),
      // Timer state for reconnection sync
      timerSeconds: this.timerSeconds,
      timerPhase: this.timerPhase,
    };
  }
}

export default GameRoom;
