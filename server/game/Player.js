// Player class
export class Player {
  constructor(id, name, photo = null) {
    this.id = id;
    this.name = name;
    this.photo = photo; // Base64 data URL
    this.color = this.generateColor();
    this.score = 0;
    this.currentGif = null;
    this.hasVoted = false;
    this.hasSubmitted = false;
    this.promptVote = null;
  }

  generateColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
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
    };
  }
}

export default Player;
