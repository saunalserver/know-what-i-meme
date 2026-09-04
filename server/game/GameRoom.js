import { Player, pickAvatarColor } from './Player.js';
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

// Shown when the round timer runs out before a player picks anything.
export const NO_GIF_PLACEHOLDER =
  'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif';

export const MAX_PLAYERS = 9;

// A submission is either a remote GIF URL or one of this server's own pooled
// files, which are served same-origin under whatever prefix the API is mounted
// at (e.g. /kwim/api/gif/local/abc.gif).
const LOCAL_GIF_PATH = /^\/(?:[A-Za-z0-9_-]+\/)*api\/gif\/local\/[A-Za-z0-9_-]+\.gif$/;

export function isUsableGifUrl(value) {
  return typeof value === 'string'
    && (/^https?:\/\//i.test(value) || LOCAL_GIF_PATH.test(value));
}

export class GameRoom {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = [];
    this.phase = 'lobby'; // lobby, prompt_vote, gif_search, presentation, voting, round_results, leaderboard, final_results
    this.currentRound = 0;
    this.totalRounds = 3;
    this.currentPrompt = null;
    this.currentPromptOptions = [];
    this.promptVotes = new Map(); // promptIndex -> count
    this.submissions = new Map(); // playerId -> gifUrl
    this.votes = new Map(); // voterId -> targetId
    this.presentationIndex = 0;
    this.presentationOrder = []; // Randomized player IDs for anonymous presentation
    this.usedPrompts = new Set(); // Avoid repeating a prompt within one game
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();

    // Timer state
    this.timerInterval = null;
    this.timerSeconds = 0;
    this.timerPhase = null;
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

  touch() {
    this.lastActivityAt = Date.now();
  }

  // ============================================
  // TIMERS
  // ============================================

  // Every phase timer behaves the same way: broadcast a countdown, then run
  // the phase's expiry handler. Presentation and round_results used to have
  // their own near-identical copies of this.
  startTimer(phase, io, roomCode) {
    this.stopTimer();

    const total = GameRoom.TIMER_DURATIONS[phase] || 30;
    this.timerPhase = phase;
    this.timerSeconds = total;

    const emit = () => {
      io.to(roomCode).emit('timer:update', {
        phase,
        seconds: this.timerSeconds,
        total,
      });
    };

    emit();

    this.timerInterval = setInterval(() => {
      this.timerSeconds--;
      emit();
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

  // Called when a room is discarded. Without this the interval kept ticking
  // and emitting into an empty room for the lifetime of the process.
  destroy() {
    this.stopTimer();
    this.players = [];
  }

  handleTimerExpired(phase, io, roomCode) {
    this.stopTimer();

    switch (phase) {
      case 'prompt_vote':
        this.resolvePromptVote();
        this.enterPhase('gif_search', io, roomCode);
        break;

      case 'gif_search':
        // Anyone who never picked gets the placeholder, so the round can finish.
        this.activePlayers().forEach(p => {
          if (!p.hasSubmitted) {
            p.currentGif = NO_GIF_PLACEHOLDER;
            p.hasSubmitted = true;
            this.submissions.set(p.id, p.currentGif);
          }
        });
        this.enterPhase('presentation', io, roomCode);
        break;

      case 'presentation':
        this.advancePresentation(io, roomCode);
        break;

      case 'voting':
        this.finishVoting(io, roomCode);
        break;

      case 'round_results':
      case 'leaderboard':
        this.advanceAfterResults(io, roomCode);
        break;
    }
  }

  // ============================================
  // PHASE TRANSITIONS
  // ============================================

  // Single place that sets a phase, broadcasts it and starts its timer, so
  // no caller can move the game forward and forget one of the three.
  enterPhase(phase, io, roomCode) {
    this.phase = phase;
    this.touch();

    io.to(roomCode).emit('game:state', this.toJSON());
    io.to(roomCode).emit('game:phase', { phase });

    if (GameRoom.TIMER_DURATIONS[phase]) {
      this.startTimer(phase, io, roomCode);
    }
  }

  advancePresentation(io, roomCode) {
    this.stopTimer();
    this.presentationIndex++;

    if (this.presentationIndex >= this.presentationOrder.length) {
      this.presentationIndex = 0;
      this.enterPhase('voting', io, roomCode);
    } else {
      io.to(roomCode).emit('game:state', this.toJSON());
      this.startTimer('presentation', io, roomCode);
    }
  }

  finishVoting(io, roomCode) {
    this.stopTimer();
    const results = this.calculateRoundResults();
    this.enterPhase('round_results', io, roomCode);
    io.to(roomCode).emit('round:results', { results });
    return results;
  }

  // Where the game goes after round results or the mid-game leaderboard.
  advanceAfterResults(io, roomCode) {
    this.stopTimer();

    if (this.phase !== 'leaderboard' && this.currentRound >= this.totalRounds) {
      this.enterPhase('final_results', io, roomCode);
      console.log(`🎉 Room ${roomCode}: Game complete!`);
      return;
    }

    if (this.phase !== 'leaderboard' && this.shouldShowLeaderboard()) {
      this.enterPhase('leaderboard', io, roomCode);
      console.log(`📊 Room ${roomCode}: Showing leaderboard at round ${this.currentRound}`);
      return;
    }

    this.currentRound++;
    this.preparePromptVoting();
    this.enterPhase('prompt_vote', io, roomCode);
    console.log(`🔄 Room ${roomCode}: Starting round ${this.currentRound}`);
  }

  // Show a leaderboard every 3 rounds, but only in games long enough to need one.
  shouldShowLeaderboard() {
    return this.totalRounds >= 5 && this.currentRound > 0 && this.currentRound % 3 === 0;
  }

  getLeaderboard() {
    return this.players
      .map(p => ({ id: p.id, name: p.name, score: p.score, color: p.color }))
      .sort((a, b) => b.score - a.score);
  }

  // ============================================
  // PLAYERS
  // ============================================

  // A player whose phone dropped out still owns their score and submission;
  // they just shouldn't hold up the round.
  activePlayers() {
    return this.players.filter(p => p.connected);
  }

  addPlayer(playerId, playerName, photo = null) {
    const player = new Player(
      playerId,
      playerName,
      photo,
      pickAvatarColor(Array.from(this.players.values(), (p) => p.color))
    );
    this.players.push(player);
    this.touch();
    return player;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
      this.presentationOrder = this.presentationOrder.filter(id => id !== playerId);
      this.submissions.delete(playerId);
      this.votes.delete(playerId);
      // Votes cast *for* the departed player no longer have a target.
      for (const [voterId, targetId] of this.votes.entries()) {
        if (targetId === playerId) {
          this.votes.delete(voterId);
          const voter = this.getPlayer(voterId);
          if (voter) voter.hasVoted = false;
        }
      }
      // Presentation may now be pointing past the end of a shorter list.
      if (this.presentationIndex >= this.presentationOrder.length) {
        this.presentationIndex = Math.max(0, this.presentationOrder.length - 1);
      }
      this.touch();
    }
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  // ============================================
  // ROUNDS
  // ============================================

  startGame(totalRounds = 3) {
    this.totalRounds = Math.min(Math.max(Number(totalRounds) || 3, 1), 15);
    this.currentRound = 1;
    this.usedPrompts.clear();
    this.preparePromptVoting();
    this.phase = 'prompt_vote';
    this.touch();
  }

  preparePromptVoting() {
    const rawPrompts = getRandomPrompts(3, true, this.usedPrompts);
    rawPrompts.forEach(p => this.usedPrompts.add(p));

    this.currentPromptOptions = rawPrompts.map(prompt =>
      fillPlayerPlaceholders(prompt, this.players)
    );
    this.currentPrompt = null;

    this.promptVotes.clear();
    this.currentPromptOptions.forEach((_, index) => this.promptVotes.set(index, 0));

    this.players.forEach(p => p.resetForNewRound());
    this.submissions.clear();
    this.votes.clear();
    this.presentationIndex = 0;
    // Randomize presentation order so memes stay anonymous.
    this.presentationOrder = shuffleArray(this.players.map(p => p.id));
  }

  voteForPrompt(playerId, promptIndex) {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    // A client sending a junk index used to poison the vote map and leave the
    // round with an undefined prompt.
    if (!Number.isInteger(promptIndex) ||
        promptIndex < 0 ||
        promptIndex >= this.currentPromptOptions.length) {
      return false;
    }

    this.touch();

    // Clicking the current choice again clears it.
    if (player.promptVote === promptIndex) {
      this.promptVotes.set(promptIndex, Math.max(0, (this.promptVotes.get(promptIndex) || 0) - 1));
      player.promptVote = null;
      return true;
    }

    if (player.promptVote !== null) {
      const prev = this.promptVotes.get(player.promptVote) || 0;
      this.promptVotes.set(player.promptVote, Math.max(0, prev - 1));
    }

    player.promptVote = promptIndex;
    this.promptVotes.set(promptIndex, (this.promptVotes.get(promptIndex) || 0) + 1);
    return true;
  }

  allPlayersVotedForPrompt() {
    const active = this.activePlayers();
    return active.length > 0 && active.every(p => p.promptVote !== null);
  }

  // Highest-voted prompt wins; ties (including nobody voting) break randomly
  // rather than always landing on option 1.
  getWinningPrompt() {
    if (this.currentPromptOptions.length === 0) return null;

    let best = -1;
    let winners = [];
    for (let i = 0; i < this.currentPromptOptions.length; i++) {
      const votes = this.promptVotes.get(i) || 0;
      if (votes > best) {
        best = votes;
        winners = [i];
      } else if (votes === best) {
        winners.push(i);
      }
    }

    const index = winners[Math.floor(Math.random() * winners.length)];
    this.currentPrompt = this.currentPromptOptions[index];
    return this.currentPrompt;
  }

  resolvePromptVote() {
    return this.getWinningPrompt();
  }

  submitGif(playerId, gifUrl) {
    const player = this.getPlayer(playerId);
    if (!player) return false;
    if (!isUsableGifUrl(gifUrl)) return false;

    // Players may keep changing their pick until the timer runs out.
    player.currentGif = gifUrl;
    player.hasSubmitted = true;
    this.submissions.set(playerId, gifUrl);
    this.touch();
    return true;
  }

  allPlayersSubmitted() {
    const active = this.activePlayers();
    return active.length > 0 && active.every(p => p.hasSubmitted);
  }

  castVote(voterId, targetId) {
    const voter = this.getPlayer(voterId);
    if (!voter) return false;
    if (voterId === targetId) return false; // Can't vote for yourself
    // Ignore votes for someone who isn't in the round.
    if (!this.presentationOrder.includes(targetId)) return false;

    voter.hasVoted = true;
    this.votes.set(voterId, targetId);
    this.touch();
    return true;
  }

  allPlayersVoted() {
    const active = this.activePlayers();
    return active.length > 0 && active.every(p => p.hasVoted);
  }

  isFinalRound() {
    return this.currentRound >= this.totalRounds;
  }

  // Double points in the last round keeps the game winnable to the end.
  getPointsMultiplier() {
    return this.isFinalRound() ? 2 : 1;
  }

  calculateRoundResults() {
    const voteCounts = new Map();
    const voteBreakdown = new Map(); // targetId -> voters
    const multiplier = this.getPointsMultiplier();

    for (const [voterId, targetId] of this.votes.entries()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);

      if (!voteBreakdown.has(targetId)) voteBreakdown.set(targetId, []);
      const voter = this.getPlayer(voterId);
      if (voter) {
        voteBreakdown.get(targetId).push({
          voterId,
          voterName: voter.name,
          voterColor: voter.color,
        });
      }
    }

    const results = [];
    for (const player of this.players) {
      const votesReceived = voteCounts.get(player.id) || 0;
      const pointsEarned = votesReceived * multiplier;
      if (pointsEarned > 0) player.addScore(pointsEarned);

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

    results.sort((a, b) => b.votesReceived - a.votesReceived);
    return results;
  }

  // Back to the lobby with the same players, scores cleared.
  resetToLobby() {
    this.stopTimer();
    this.phase = 'lobby';
    this.currentRound = 0;
    this.currentPrompt = null;
    this.currentPromptOptions = [];
    this.promptVotes.clear();
    this.submissions.clear();
    this.votes.clear();
    this.presentationIndex = 0;
    this.presentationOrder = [];
    this.usedPrompts.clear();
    this.players.forEach(p => {
      p.resetForNewRound();
      p.score = 0;
    });
    this.touch();
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
      promptVoteCounts: Object.fromEntries(this.promptVotes),
      submissions: Object.fromEntries(this.submissions),
      votes: Object.fromEntries(this.votes),
      presentationIndex: this.presentationIndex,
      presentationOrder: this.presentationOrder,
      playerCount: this.players.length,
      isFinalRound: this.isFinalRound(),
      pointsMultiplier: this.getPointsMultiplier(),
      // Timer state so a reconnecting client resyncs its countdown.
      timerSeconds: this.timerSeconds,
      timerPhase: this.timerPhase,
    };
  }
}

export default GameRoom;
