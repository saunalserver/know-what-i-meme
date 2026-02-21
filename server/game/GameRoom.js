import { Player } from './Player.js';
import { getRandomPrompts, fillPlayerPlaceholders } from '../data/prompts.js';

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
    const multiplier = this.getPointsMultiplier();

    for (const targetId of this.votes.values()) {
      const count = voteCounts.get(targetId) || 0;
      voteCounts.set(targetId, count + 1);
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
        gifUrl: player.currentGif,
        votesReceived,
        pointsEarned,
        multiplier,
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
      playerCount: this.players.length,
      isFinalRound: this.isFinalRound(),
      pointsMultiplier: this.getPointsMultiplier(),
    };
  }
}

export default GameRoom;
