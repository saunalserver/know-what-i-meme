import { Player } from './Player.js';
import { getRandomPrompts } from '../data/prompts.js';

export class GameRoom {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = [];
    this.phase = 'lobby'; // lobby, waiting, prompt_vote, gif_search, presentation, voting, round_results, final_results
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
  }

  addPlayer(playerId, playerName) {
    const player = new Player(playerId, playerName);
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
    this.currentPromptOptions = getRandomPrompts(3);
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
    if (!player || player.promptVote !== null) return false;

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
    if (!player || player.hasSubmitted) return false;

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
    if (!voter || voter.hasVoted) return false;
    if (voterId === targetId) return false; // Can't vote for yourself

    voter.hasVoted = true;
    this.votes.set(voterId, targetId);
    return true;
  }

  allPlayersVoted() {
    return this.players.every(p => p.hasVoted);
  }

  calculateRoundResults() {
    const voteCounts = new Map();

    for (const targetId of this.votes.values()) {
      const count = voteCounts.get(targetId) || 0;
      voteCounts.set(targetId, count + 1);
    }

    // Award points
    const results = [];
    for (const player of this.players) {
      const votesReceived = voteCounts.get(player.id) || 0;
      if (votesReceived > 0) {
        player.addScore(votesReceived);
      }
      results.push({
        playerId: player.id,
        playerName: player.name,
        gifUrl: player.currentGif,
        votesReceived,
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
    };
  }
}

export default GameRoom;
