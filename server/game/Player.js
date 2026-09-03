// Player class
const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];

export class Player {
  constructor(id, name, photo = null) {
    this.id = id;
    this.name = name;
    this.photo = photo; // Base64 data URL or image URL
    this.color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    this.score = 0;
    this.currentGif = null;
    this.hasVoted = false;
    this.hasSubmitted = false;
    this.promptVote = null;
    // A phone that locks or loses wifi stays in the game as a disconnected
    // player, keeping its score and submission until it rejoins.
    this.connected = true;
    this.disconnectedAt = null;
  }

  resetForNewRound() {
    this.currentGif = null;
    this.hasVoted = false;
    this.hasSubmitted = false;
    this.promptVote = null;
  }

  addScore(points) {
    this.score += points;
  }

  markDisconnected() {
    this.connected = false;
    this.disconnectedAt = Date.now();
  }

  markConnected(newId) {
    this.id = newId;
    this.connected = true;
    this.disconnectedAt = null;
  }

  // Every field the client reads must be here: anything missing arrives as
  // `undefined` and silently fails checks like `promptVote !== null`.
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      photo: this.photo,
      color: this.color,
      score: this.score,
      currentGif: this.currentGif,
      hasVoted: this.hasVoted,
      hasSubmitted: this.hasSubmitted,
      promptVote: this.promptVote,
      connected: this.connected,
    };
  }
}

export default Player;
